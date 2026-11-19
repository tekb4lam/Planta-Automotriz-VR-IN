import json, numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation as R

def chain(path, mimic=None):
    d = json.load(open(path)); J = d['joints']
    return J, mimic or {}

def T_of(xyz, rpy):
    T = np.eye(4); T[:3, :3] = R.from_euler('xyz', rpy).as_matrix(); T[:3, 3] = xyz; return T

def fk(J, q, mimic, tool):
    T = np.eye(4); qi = 0; vals = {}
    for j in J:
        if j['name'] in mimic:
            src, mult = mimic[j['name']]; a = vals[src] * mult
        else:
            a = q[qi]; qi += 1
        vals[j['name']] = a
        T = T @ T_of(j['xyz'], j['rpy'])
        Rj = np.eye(4); Rj[:3, :3] = R.from_rotvec(np.array(j['axis']) * a).as_matrix(); T = T @ Rj
    tip = T @ np.array([tool[0], tool[1], tool[2], 1.0])
    axis = T[:3, :3] @ np.array([1.0, 0, 0])
    return tip[:3], axis

def solve(J, mimic, tool, target, direction, seed, w_dir=0.5):
    free = [j for j in J if j['name'] not in mimic]
    lo = np.array([j['lower'] for j in free]); hi = np.array([j['upper'] for j in free])
    d = np.array(direction, float); d /= np.linalg.norm(d)
    def res(q):
        p, a = fk(J, q, mimic, tool)
        return np.concatenate([(p - target) * 2.0, (a - d) * w_dir, (q - seed) * 0.02])
    best = None
    for s in [seed, seed + np.random.uniform(-0.6, 0.6, len(seed)), seed + np.random.uniform(-1.2, 1.2, len(seed))]:
        s = np.clip(s, lo + 1e-3, hi - 1e-3)
        r = least_squares(res, s, bounds=(lo, hi), max_nfev=400)
        p, a = fk(J, r.x, mimic, tool)
        err = np.linalg.norm(p - target)
        if best is None or err < best[1]: best = (r.x, err, np.linalg.norm(a - d))
    return best

np.random.seed(3)
out = {}
# ---------- KUKA KR210 con pinza de soldadura (punta a 0.62 m de la brida) ----------
J, mim = chain('out/kr210.json')
tool = (0.62, 0.0, 0.0)
D = 2.7
home = np.array([0, -0.3, 0.9, 0, 0.6, 0])
seed = np.array([0, 0.5, -0.2, 0, -0.5, 0])
weld = []
pts = [(y, z) for z in (0.95, 1.45, 1.85) for y in (-1.5, -0.6, 0.4, 1.3)]
errs = []
for (y, z) in pts:
    tgt = np.array([D - 1.02, y, z])
    dirv = [1, 0, -0.35] if z < 1.7 else [0.6, 0, -1]
    q, e, ea = solve(J, mim, tool, tgt, dirv, seed)
    errs.append(round(e, 3)); weld.append([round(x, 4) for x in q]); seed = q
print('KR210 weld errs', errs)
# manipulación de vidrio / piezas: A = toma en rack lateral, B = colocación en carrocería
qa, ea, _ = solve(J, mim, (0.3, 0, 0), np.array([-0.2, -1.6, 1.0]), [0, -1, -0.3], np.array([-1.5, 0.3, 0.2, 0, -0.6, 0]))
qb, eb, _ = solve(J, mim, (0.3, 0, 0), np.array([D - 0.5, 0.3, 1.75]), [0.4, 0, -1], np.array([0, 0.5, -0.3, 0, -0.8, 0]))
print('KR210 pick/place errs', round(ea, 3), round(eb, 3))
qh, eh, _ = solve(J, mim, tool, np.array([1.25, 0.0, 1.75]), [0.5, 0, -1], np.array([0, 0.2, 0.2, 0, -0.8, 0]))
print('home err', round(eh, 3))
out['kr210'] = {'home': qh.round(4).tolist(), 'weld': weld, 'pick': qa.round(4).tolist(), 'place': qb.round(4).tolist(), 'D': D, 'tool': tool}

# ---------- ABB IRB5400 pintura (campana a 0.3 m de la brida, distancia de rociado 0.3 m) ----------
J, mim = chain('out/irb5400.json', {'joint_5b': ('joint_5', -1.0)})
tool = (0.30, 0.0, 0.0)
D = 3.0
seed = np.array([0, 0.4, -0.2, 0, 0.3, 0])
side, roof = [], []
errs = []
for y in np.linspace(-2.2, 2.2, 9):
    q, e, _ = solve(J, mim, tool, np.array([D - 1.02 - 0.3, y, 1.25]), [1, 0, -0.1], seed); side.append(q.round(4).tolist()); seed = q; errs.append(round(e, 3))
for y in np.linspace(1.6, -1.6, 7):
    q, e, _ = solve(J, mim, tool, np.array([D - 0.75, y, 2.3]), [0.3, 0, -1], seed); roof.append(q.round(4).tolist()); seed = q; errs.append(round(e, 3))
print('IRB5400 errs', errs)
qh, eh, _ = solve(J, mim, tool, np.array([1.5, 0.0, 1.9]), [0.4, 0, -1], np.array([0, 0.2, 0.1, 0, 0.5, 0]))
print('home err', round(eh, 3))
out['irb5400'] = {'home': qh.round(4).tolist(), 'side': side, 'roof': roof, 'D': D, 'tool': tool}
json.dump(out, open('final/models/robot_paths.json', 'w'))
