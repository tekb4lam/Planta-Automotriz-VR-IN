import * as THREE from 'three';
import { LINE, slotX } from './config.js';
import { Batcher, G, M, P, mergeColored, mergeParts, slab, CanvasPanel, rand, damp, smooth, clamp, lerp, FONT, roundRect } from './util.js';
import { S, lineRunning } from './state.js';
import { A } from './assets.js';
import { RealRobot } from './robots.js';
import { RealWorker, makePerson } from './people.js';

const C = { robot: 0xff6a00, dark: 0x2b2f33, white: 0xececec, gray: 0x707880, copper: 0xb87333 };
const HOME = [0, -0.05, 0.55, -1.3];

// ================= ROBOT INDUSTRIAL 6 EJES =================
const rCache = {};
function robotGeos(type, color) {
  const key = type + color;
  if (rCache[key]) return rCache[key];
  const wrist = [P.cyl(0.1, 0.24, 0.1, 0, 0, 0, 0, Math.PI / 2), C.dark];
  const tools = {
    weld: { parts: [wrist, [P.box(0.14, 0.14, 0.14, 0.26, 0, 0), C.dark], [P.box(0.08, 0.55, 0.08, 0.32, -0.25, 0), C.gray], [P.box(0.42, 0.07, 0.07, 0.52, -0.5, 0), C.gray], [P.box(0.34, 0.07, 0.07, 0.47, 0.02, 0), C.gray], [P.cyl(0.022, 0.14, 0.7, -0.42, 0), C.copper], [P.cyl(0.022, 0.12, 0.62, -0.05, 0), C.copper]], tip: new THREE.Vector3(0.68, -0.27, 0) },
    paint: { parts: [wrist, [P.cyl(0.09, 0.36, 0.32, 0, 0, 0, 0, Math.PI / 2), C.white], [P.cyl(0.14, 0.06, 0.52, 0, 0, 0, 0, Math.PI / 2), 0xb0b0b0]], tip: new THREE.Vector3(0.56, 0, 0) },
    grip: { parts: [wrist, [P.box(0.06, 0.7, 1.0, 0.3, 0, 0), C.dark], [P.cyl(0.07, 0.06, 0.35, 0.28, 0.4), 0x222222], [P.cyl(0.07, 0.06, 0.35, -0.28, -0.4), 0x222222]], tip: new THREE.Vector3(0.36, 0, 0) },
  };
  const t = tools[type] || tools.weld;
  rCache[key] = {
    base: mergeColored([[P.cyl(0.42, 0.5, 0, 0.25, 0), C.dark], [P.box(1.0, 0.06, 1.0, 0, 0.03, 0), C.dark]]),
    turret: mergeColored([[P.cyl(0.36, 0.4, 0, 0.2, 0), color], [P.box(0.55, 0.5, 0.62, 0, 0.55, 0), color], [P.cyl(0.24, 0.72, 0, 0.7, 0, Math.PI / 2), C.dark]]),
    lower: mergeColored([[P.box(0.3, 1.2, 0.34, 0, 0.6, 0), color], [P.cyl(0.2, 0.6, 0, 1.2, 0, Math.PI / 2), C.dark]]),
    upper: mergeColored([[P.box(1.1, 0.26, 0.28, 0.5, 0, 0), color], [P.box(0.42, 0.36, 0.4, -0.2, 0, 0), color], [P.cyl(0.16, 0.42, 1.05, 0, 0, Math.PI / 2), C.dark]]),
    tool: mergeColored(t.parts),
    tip: t.tip,
  };
  return rCache[key];
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const SPARK = new THREE.Color(1.0, 0.72, 0.3);
export class Robot {
  constructor(scene, x, z, yaw, type = 'weld', color = C.robot) {
    const g = robotGeos(type, color);
    this.type = type;
    const mk = (geo) => new THREE.Mesh(geo, M.vc);
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); this.root.rotation.y = yaw;
    this.root.add(mk(g.base));
    this.j1 = new THREE.Group(); this.j1.position.y = 0.5; this.j1.add(mk(g.turret)); this.root.add(this.j1);
    this.j2 = new THREE.Group(); this.j2.position.y = 0.7; this.j2.add(mk(g.lower)); this.j1.add(this.j2);
    this.j3 = new THREE.Group(); this.j3.position.y = 1.2; this.j3.add(mk(g.upper)); this.j2.add(this.j3);
    this.j4 = new THREE.Group(); this.j4.position.x = 1.1; this.j4.add(mk(g.tool)); this.j3.add(this.j4);
    this.tip = new THREE.Object3D(); this.tip.position.copy(g.tip); this.j4.add(this.tip);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false;
    this.root.add(this.ring);
    this.a = HOME.slice();
    this.phi = rand(0, 6.28);
    this.mode = 'normal';
    this.cool = 0;
    scene.add(this.root);
  }
  update(dt, t, working, fx, sprayColor, audio) {
    const f = this.phi;
    let tgt, k;
    if (this.mode === 'rogue') {
      tgt = [0.7 + 1.4 * Math.sin(2.1 * t + f), -0.75 + 0.45 * Math.sin(2.9 * t + f), 0.25 * Math.sin(3.3 * t + f), -0.4 + 0.9 * Math.sin(4.1 * t + f)];
      k = 7;
    } else if (working) {
      if (this.type === 'paint') tgt = [0.75 * Math.sin(0.9 * t + f), -0.35 + 0.15 * Math.sin(1.3 * t + f), -0.1 + 0.3 * Math.sin(1.1 * t + f), -0.75 + 0.2 * Math.sin(1.7 * t)];
      else if (this.type === 'grip') tgt = [0.4 * Math.sin(0.6 * t + f), -0.45 + 0.1 * Math.sin(0.8 * t + f), -0.2, -1.0];
      else tgt = [0.35 * Math.sin(1.4 * t + f), -0.45 + 0.18 * Math.sin(1.9 * t + f), -0.35 + 0.2 * Math.sin(2.3 * t + f), -0.9 + 0.3 * Math.sin(2.7 * t + f)];
      k = 4;
    } else { tgt = HOME; k = 2.5; }
    for (let i = 0; i < 4; i++) this.a[i] = damp(this.a[i], tgt[i], k, dt);
    this.j1.rotation.y = this.a[0]; this.j2.rotation.z = this.a[1]; this.j3.rotation.z = this.a[2]; this.j4.rotation.z = this.a[3];
    const welding = (this.type === 'weld' && working) || this.mode === 'rogue';
    if (welding && Math.sin(2.6 * t + f * 3) > 0.5) {
      this.cool -= dt;
      if (this.cool <= 0) {
        this.cool = 0.06;
        this.root.updateMatrixWorld(true);
        this.tip.getWorldPosition(_v);
        fx.sparks.emit(_v, 9, SPARK, 2.4, 1, null, 0.5);
        fx.flash(_v);
        if (Math.random() < 0.15) audio?.zap(_v);
      }
    }
    if (this.type === 'paint' && working && this.mode !== 'rogue' && sprayColor && Math.random() < dt * 45) {
      this.root.updateMatrixWorld(true);
      this.tip.getWorldPosition(_v);
      _d.set(1, 0, 0).transformDirection(this.j4.matrixWorld).multiplyScalar(1.4);
      fx.mist.emit(_v, 3, sprayColor, 1.0, 0.28, _d, 1.0);
    }
    if (this.ring.visible !== (this.mode === 'rogue')) this.ring.visible = this.mode === 'rogue';
    if (this.ring.visible) this.ring.material.opacity = 0.4 + 0.4 * Math.sin(t * 8);
  }
}

// ================= OPERARIOS =================
const wCache = {};
function workerGeos(vest, helmet) {
  const key = vest + '_' + helmet;
  if (wCache[key]) return wCache[key];
  wCache[key] = {
    torso: mergeColored([[P.box(0.42, 0.62, 0.26, 0, 1.22, 0), vest], [P.box(0.44, 0.14, 0.27, 0, 0.95, 0), 0x263238], [P.sph(0.12, 0, 1.63, 0), 0xc68e6a], [P.sph(0.14, 0, 1.7, 0, 1, 0.62, 1), helmet], [P.box(0.3, 0.03, 0.1, 0, 1.69, 0.13), helmet], [P.box(0.2, 0.05, 0.02, 0, 1.64, 0.115), 0x222222]]),
    arm: mergeColored([[P.box(0.1, 0.6, 0.11, 0, -0.3, 0), vest], [P.sph(0.055, 0, -0.64, 0), 0x333333]]),
    leg: mergeColored([[P.box(0.15, 0.86, 0.17, 0, -0.43, 0), 0x223a5e], [P.box(0.16, 0.08, 0.26, 0, -0.88, 0.05), 0x1a1a1a]]),
  };
  return wCache[key];
}
export class WorkerP {
  constructor(scene, x, z, yaw, vest = 0xff8c1a, helmet = 0xffffff) {
    const g = workerGeos(vest, helmet);
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.yaw = yaw;
    this.root.add(new THREE.Mesh(g.torso, M.vcMatte));
    const limb = (geo, px, py) => { const p = new THREE.Group(); p.position.set(px, py, 0); p.add(new THREE.Mesh(geo, M.vcMatte)); this.root.add(p); return p; };
    this.armL = limb(g.arm, -0.27, 1.48); this.armR = limb(g.arm, 0.27, 1.48);
    this.legL = limb(g.leg, -0.1, 0.92); this.legR = limb(g.leg, 0.1, 0.92);
    this.phi = rand(0, 6.28);
    scene.add(this.root);
  }
  update(dt, t, mode) {
    const f = this.phi;
    let al = -0.08, ar = -0.08, ll = 0, lr = 0;
    if (mode === 'work') { al = -1.0 + 0.35 * Math.sin(3 * t + f); ar = -0.85 + 0.35 * Math.sin(3 * t + f + 1.7); }
    else if (mode === 'walk') { const s = Math.sin(6.5 * t + f); ll = 0.5 * s; lr = -0.5 * s; al = -0.4 * s; ar = 0.4 * s; }
    else if (mode === 'alarm') { al = -2.6 + 0.3 * Math.sin(8 * t); ar = -0.1; }
    this.armL.rotation.x = damp(this.armL.rotation.x, al, 8, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, ar, 8, dt);
    this.legL.rotation.x = damp(this.legL.rotation.x, ll, 12, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, lr, 12, dt);
    if (mode === 'idle') this.root.rotation.y = this.yaw + 0.15 * Math.sin(0.4 * t + f);
  }
}

// ================= CARROCERÍAS =================
const PAINT_STAGES = [
  [-1, [P.box(4.3, 0.1, 1.66, 0, 0.25, 0), P.box(2.2, 0.12, 0.3, 0, 0.33, 0)]],
  [1, [P.box(1.2, 0.14, 0.1, 1.6, 0.36, 0.5), P.box(1.2, 0.14, 0.1, 1.6, 0.36, -0.5), P.box(1.1, 0.14, 0.1, -1.6, 0.36, 0.5), P.box(1.1, 0.14, 0.1, -1.6, 0.36, -0.5), P.box(0.06, 0.55, 1.6, 0.95, 0.58, 0), P.box(0.06, 0.35, 1.6, -2.1, 0.5, 0)]],
  [2, [-1, 1].flatMap((s) => [P.box(4.3, 0.2, 0.07, 0, 0.38, 0.82 * s), P.box(1.1, 0.5, 0.07, -1.6, 0.75, 0.82 * s), slab(0.9, 0.98, 0.28, 1.38, 0.08, 0.07, 0.8 * s), P.box(0.1, 0.46, 0.07, -0.2, 1.17, 0.8 * s), slab(-1.1, 1.38, -1.8, 0.98, 0.08, 0.07, 0.8 * s), P.box(3.4, 0.05, 0.07, -0.3, 0.97, 0.82 * s)])],
  [3, [P.box(1.4, 0.05, 1.58, -0.42, 1.41, 0), P.box(1.42, 0.06, 0.06, -0.42, 1.4, 0.79), P.box(1.42, 0.06, 0.06, -0.42, 1.4, -0.79), P.box(0.08, 0.06, 1.6, 0.28, 1.38, 0), P.box(0.08, 0.06, 1.6, -1.1, 1.38, 0)]],
  [6, [slab(2.25, 0.82, 0.9, 0.98, 0.06, 1.62), P.box(0.18, 0.32, 1.72, 2.2, 0.5, 0), P.box(0.18, 0.3, 1.72, -2.22, 0.5, 0), slab(-1.8, 0.98, -2.25, 0.9, 0.06, 1.6), P.box(0.07, 0.35, 1.6, -2.22, 0.75, 0),
    ...[-1, 1].flatMap((s) => [P.box(1.35, 0.42, 0.07, 1.58, 0.65, 0.82 * s), P.box(1.05, 0.55, 0.06, 0.38, 0.68, 0.85 * s), P.box(0.95, 0.55, 0.06, -0.65, 0.68, 0.85 * s), P.box(0.06, 0.04, 0.03, 0.05, 0.85, 0.89 * s), P.box(0.06, 0.04, 0.03, -0.95, 0.85, 0.89 * s)])]],
];
const wheel = (x, z) => [[P.cyl(0.34, 0.24, x, 0.34, z, Math.PI / 2), 0x121212], [P.cyl(0.22, 0.26, x, 0.34, z, Math.PI / 2), 0xbfc4c8]];
const MISC_STAGES = [
  [(s) => s <= 15, [[P.box(4.6, 0.08, 0.12, 0, -0.1, 0.5), C.gray], [P.box(4.6, 0.08, 0.12, 0, -0.1, -0.5), C.gray], [P.box(0.12, 0.08, 1.1, 1.8, -0.1, 0), C.gray], [P.box(0.12, 0.08, 1.1, -1.8, -0.1, 0), C.gray], ...[[1.5, 0.5], [1.5, -0.5], [-1.5, 0.5], [-1.5, -0.5]].map(([x, z]) => [P.box(0.1, 0.3, 0.1, x, 0.06, z), 0x444444])]],
  [(s) => s >= 16, [[P.box(0.5, 0.55, 0.5, 0.05, 0.62, 0.4), 0x2a2a2a], [P.box(0.5, 0.55, 0.5, 0.05, 0.62, -0.4), 0x2a2a2a], [P.box(0.5, 0.5, 1.4, -0.95, 0.6, 0), 0x2a2a2a], [P.box(0.35, 0.3, 1.5, 0.75, 0.85, 0), 0x1a1a1a]]],
  [(s) => s >= 17, [[P.box(3.4, 0.18, 1.2, 0, 0.12, 0), 0x1c1c1c], [P.box(0.8, 0.45, 0.9, 1.5, 0.45, 0), 0x3a3a3a], [P.cyl(0.04, 2.4, -0.6, 0.12, 0.4, 0, 0, Math.PI / 2), 0x666666]]],
  [(s) => s >= 18, [...wheel(1.42, 0.79), ...wheel(1.42, -0.79), ...wheel(-1.42, 0.79), ...wheel(-1.42, -0.79)]],
  [(s) => s >= 21, [[P.box(0.05, 0.1, 0.36, 2.3, 0.7, 0.55), 0xffffff], [P.box(0.05, 0.1, 0.36, 2.3, 0.7, -0.55), 0xffffff], [P.box(0.05, 0.1, 0.36, -2.32, 0.78, 0.6), 0xcc0000], [P.box(0.05, 0.1, 0.36, -2.32, 0.78, -0.6), 0xcc0000], [P.box(0.04, 0.18, 0.8, 2.3, 0.55, 0), 0x111111]]],
];
const GLASS_GEO = mergeParts([slab(0.88, 0.97, 0.3, 1.37, 0.02, 1.5), slab(-1.12, 1.37, -1.78, 0.99, 0.02, 1.5), P.box(1.95, 0.36, 0.02, -0.4, 1.16, 0.81), P.box(1.95, 0.36, 0.02, -0.4, 1.16, -0.81)]);
const gCache = new Map();
function paintGeo(s) {
  const stages = PAINT_STAGES.filter(([m]) => s >= m);
  const key = 'p' + stages.length;
  if (!gCache.has(key)) gCache.set(key, mergeParts(stages.flatMap(([, p]) => p)));
  return gCache.get(key);
}
function miscGeo(s) {
  const st = MISC_STAGES.filter(([f]) => f(s));
  const key = 'm' + MISC_STAGES.map(([f]) => (f(s) ? 1 : 0)).join('');
  if (!st.length) return null;
  if (!gCache.has(key)) gCache.set(key, mergeColored(st.flatMap(([, p]) => p)));
  return gCache.get(key);
}
const CAR_COLORS = [0xa50d16, 0x0f3d7a, 0xf0f0f0, 0x151515, 0x8a9299, 0x2f5f3a, 0xf0f0f0, 0x8a9299, 0x5a6f86];
const RAW = new THREE.Color(0xa7adb3), ECOAT = new THREE.Color(0x4b4f55), PRIMER = new THREE.Color(0xcfcfc8), BURNT = new THREE.Color(0x3b2717);

// Carrocería con el modelo 3D real (LOD: alto detalle cerca, bajo detalle lejos)
let CARM;
function carMats() {
  if (CARM) return CARM;
  CARM = {
    interior: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8 }),
    chassis: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7, metalness: 0.4 }),
    tires: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    rims: new THREE.MeshStandardMaterial({ color: 0xc7cbd0, roughness: 0.25, metalness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.2 }),
    lights: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 0.4, roughness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b141c, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 }),
  };
  return CARM;
}
const SKID_GEO = mergeColored([[P.box(4.6, 0.08, 0.12, 0, -0.1, 0.5), 0x707880], [P.box(4.6, 0.08, 0.12, 0, -0.1, -0.5), 0x707880], [P.box(0.12, 0.08, 1.1, 1.8, -0.1, 0), 0x707880], [P.box(0.12, 0.08, 1.1, -1.8, -0.1, 0), 0x707880],
  ...[[1.5, 0.5], [1.5, -0.5], [-1.5, 0.5], [-1.5, -0.5]].map(([x, z]) => [P.box(0.1, 0.36, 0.1, x, 0.08, z), 0x444444])]);
class CarBody {
  constructor(scene, slot) {
    this.g = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: RAW, metalness: 0.85, roughness: 0.4, envMapIntensity: 1.2 });
    const cm = carMats();
    this.levels = [];
    const lod = new THREE.LOD();
    for (const [parts, dist] of [[A.car.hi, 0], [A.car.lo, 14]]) {
      if (!parts) continue;
      const grp = new THREE.Group();
      const L = { parts, paint: new THREE.Mesh(parts._paint[1], this.mat) };
      grp.add(L.paint);
      for (const c of ['interior', 'chassis', 'tires', 'rims', 'trim', 'lights', 'glass']) if (parts[c]) { L[c] = new THREE.Mesh(parts[c], cm[c]); grp.add(L[c]); }
      lod.addLevel(grp, dist);
      this.levels.push(L);
    }
    this.g.add(lod);
    this.skid = new THREE.Mesh(SKID_GEO, M.vc);
    this.g.add(this.skid);
    scene.add(this.g);
    this.reset(slot);
    this.setShown(slot);
  }
  reset(slot) { Body.prototype.reset.call(this, slot); }
  setShown(s) {
    if (s === this.shown) return;
    this.shown = s;
    for (const L of this.levels) {
      L.paint.geometry = L.parts._paint[Math.max(1, L.parts._paintKey(s))];
      const vis = { interior: s >= 16, chassis: s >= 17, tires: s >= 18, rims: s >= 18, glass: s >= 19, trim: s >= 20, lights: s >= 21 };
      for (const c in vis) if (L[c]) L[c].visible = vis[c];
    }
    this.skid.visible = s <= 15;
    this.applyColor();
  }
  applyColor() { Body.prototype.applyColor.call(this); }
}

class Body {
  constructor(scene, slot) {
    this.g = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: RAW, metalness: 0.85, roughness: 0.4 });
    this.paint = new THREE.Mesh(paintGeo(-1), this.mat);
    this.misc = new THREE.Mesh(miscGeo(-1), M.vc);
    this.glass = new THREE.Mesh(GLASS_GEO, M.glass);
    this.g.add(this.paint, this.misc, this.glass);
    scene.add(this.g);
    this.reset(slot);
    this.setShown(slot);
  }
  reset(slot) {
    this.slot = slot; this.shown = -2; this.defect = null; this.burnt = false;
    this.color = new THREE.Color(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
    if (this.marker) { this.marker.dead = true; this.marker = null; }
  }
  setShown(s) {
    if (s === this.shown) return;
    this.shown = s;
    this.paint.geometry = paintGeo(s);
    const mg = miscGeo(s);
    this.misc.visible = !!mg; if (mg) this.misc.geometry = mg;
    this.glass.visible = s >= 19;
    this.applyColor();
  }
  applyColor() {
    const s = this.shown, m = this.mat;
    if (this.burnt && s >= 14) { m.color.copy(BURNT); m.metalness = 0.2; m.roughness = 0.95; }
    else if (s < 8) { m.color.copy(RAW); m.metalness = 0.85; m.roughness = 0.4; }
    else if (s < 10) { m.color.copy(ECOAT); m.metalness = 0.2; m.roughness = 0.6; }
    else if (s < 12) { m.color.copy(PRIMER); m.metalness = 0.05; m.roughness = 0.65; }
    else { m.color.copy(this.color); m.metalness = 0.55; m.roughness = 0.28; }
  }
}

// ================= LÍNEA PRINCIPAL =================
export class Line {
  constructor(scene, fx, audio) {
    this.scene = scene; this.fx = fx; this.audio = audio;
    this.N = LINE.N;
    this.t = LINE.move + 0.5; this.arrived = true;
    this.onArrive = null;
    this.buildStatic(scene);
    this.bodies = [];
    for (let s = -1; s < this.N; s++) this.bodies.push(A.car ? new CarBody(scene, s) : new Body(scene, s));
    this.robots = [];
    const R = (slot, side, type, dx = 0, color) => {
      let r;
      const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (A.ok) {
        const kind = type === 'paint' ? 'irb5400' : 'kr210', job = type === 'paint' ? 'paint' : type === 'grip' ? 'pick' : 'weld';
        r = new RealRobot(scene, slotX(slot) + dx, LINE.z + side * A.robot_pathsInfo[kind].D, yaw, kind, job);
      } else r = new Robot(scene, slotX(slot) + dx, LINE.z + side * 2.45, yaw, type, color);
      this.robots.push({ r, slot, zone: slot <= 7 ? 'biw' : slot <= 13 ? 'paint' : 'asm' });
      return r;
    };
    R(0, -1, 'grip', 0.8);
    for (let i = 1; i <= 5; i++) { R(i, 1, 'weld', -1.1); R(i, -1, 'weld', 1.1); }
    R(6, 1, 'weld', -0.8); R(6, -1, 'weld', 0.8);
    for (let i = 9; i <= 13; i++) { R(i, 1, 'paint', -0.6, C.white); R(i, -1, 'paint', 0.6, C.white); }
    R(19, -1, 'grip', 0.0, C.white);
    // operarios
    this.workers = [];
    const Worker = A.worker ? RealWorker : WorkerP;
    const vests = [0xff8c1a, 0xd9ff3a];
    for (let i = 16; i <= 21; i++) {
      if (i !== 17) this.workers.push({ w: (A.worker ? makePerson(scene, 'linea', slotX(i) + rand(-0.8, 0.8), LINE.z + 2.0, Math.PI, { helmet: 0xffffff, outfit: 'coverall' }) : new Worker(scene, slotX(i), LINE.z + 2.0, Math.PI, vests[i % 2], 0xffffff)), slot: i });
      if (i !== 19 && i !== 17) this.workers.push({ w: (A.worker ? makePerson(scene, 'linea', slotX(i) + rand(-0.8, 0.8), LINE.z - 2.0, 0, { helmet: 0xffd21a, outfit: 'coverall' }) : new Worker(scene, slotX(i), LINE.z - 2.0, 0, vests[(i + 1) % 2], 0xffd21a)), slot: i });
    }
    this.workers.push({ w: (A.worker ? makePerson(scene, 'calidad', slotX(23) + 0.5, LINE.z + 2.1, Math.PI, { helmet: 0xffffff, outfit: 'operator' }) : new Worker(scene, slotX(23) + 0.5, LINE.z + 2.1, Math.PI, 0x2f80ed, 0xffffff)), slot: 23 });
    this.workers.push({ w: (A.worker ? makePerson(scene, 'calidad', slotX(22) - 2.8, LINE.z + 2.2, Math.PI * 0.75, { helmet: 0xffffff, outfit: 'operator' }) : new Worker(scene, slotX(22) - 2.8, LINE.z + 2.2, Math.PI * 0.75, 0x2f80ed, 0xffffff)), slot: 22 });
    // peatones en pasillo
    const WalkerC = A.worker ? RealWorker : WorkerP;
    this.walkers = [
      { w: (A.worker ? makePerson(scene, 'mantenimiento', -80, 2.4, Math.PI / 2, { vest: 0xd9ff3a, helmet: 0xffffff, outfit: 'maint' }) : new WalkerC(scene, -80, 2.4, Math.PI / 2, 0xd9ff3a, 0xffffff)), x0: -110, x1: 100, z: 2.4, v: 1.25 },
      { w: (A.worker ? makePerson(scene, 'linea', 30, 4.6, -Math.PI / 2, { vest: 0xff8c1a, helmet: 0x2f80ed, outfit: 'coverall' }) : new WalkerC(scene, 30, 4.6, -Math.PI / 2, 0xff8c1a, 0x2f80ed)), x0: -60, x1: 110, z: 4.6, v: -1.1 },
      { w: (A.worker ? makePerson(scene, 'mantenimiento', -20, 3.2, Math.PI / 2, { vest: 0xd9ff3a, helmet: 0xffd21a, outfit: 'maint' }) : new WalkerC(scene, -20, 3.2, Math.PI / 2, 0xd9ff3a, 0xffd21a)), x0: -95, x1: 60, z: 3.2, v: 1.0 },
    ];
    this.ovenSmokeT = 0;
    this.gaugeT = 0;
  }

  buildStatic(scene) {
    const sb = new Batcher();
    const z = LINE.z;
    const xa = -48, xb = 114;
    // bastidor del transportador
    for (const dz of [-0.8, 0.8]) sb.box(xb - xa, 0.12, 0.12, M.darkSteel, (xa + xb) / 2, 0.4, z + dz);
    for (let x = xa; x <= xb; x += 2.5) for (const dz of [-0.8, 0.8]) sb.box(0.1, 0.4, 0.1, M.darkSteel, x, 0.2, z + dz);
    sb.box(38, 0.1, 2.4, M.steel, 81, 0.55, z); // placa de ensamble (slat)
    for (const dz of [-1.22, 1.22]) sb.box(38, 0.02, 0.06, M.yellowPaint, 81, 0.61, z + dz);
    const rollers = [];
    for (let x = xa + 1; x <= xb; x += 0.55) if (x < 62 || x > 100) rollers.push(x);
    const rm = new THREE.InstancedMesh(G.cyl8, M.steel, rollers.length);
    const d = new THREE.Object3D();
    rollers.forEach((x, i) => { d.position.set(x, 0.45, z); d.rotation.set(Math.PI / 2, 0, 0); d.scale.set(0.05, 1.5, 0.05); d.updateMatrix(); rm.setMatrixAt(i, d.matrix); });
    scene.add(rm);
    // cerca de carrocería
    for (const fz of [z + 4.2, z - 4.2]) for (let x = -44; x < 2; x += 2) { sb.box(2, 2.2, 0.02, M.fence, x + 1, 1.2, fz); sb.box(0.06, 2.3, 0.06, M.fencePost, x, 1.15, fz); }
    // pórtico de geometría (framing) en estación 2 y 3
    if (!A.ok) for (const sx of [slotX(2) - 2, slotX(2) + 2, slotX(3) - 2, slotX(3) + 2]) { sb.box(0.35, 4.2, 0.35, M.steel, sx, 2.1, z - 3.4); sb.box(0.35, 4.2, 0.35, M.steel, sx, 2.1, z + 3.4); sb.box(0.35, 0.35, 7.2, M.steel, sx, 4.3, z); }
    if (!A.ok) { sb.box(4.4, 0.35, 0.35, M.steel, slotX(2), 4.3, z - 3.4); sb.box(4.4, 0.35, 0.35, M.steel, slotX(2), 4.3, z + 3.4); }
    // grúa de alimentación
    const fxp = slotX(-1);
    for (const dz of [-2.2, 2.2]) sb.box(0.3, 6.6, 0.3, M.yellow, fxp, 3.3, z + dz);
    sb.box(0.4, 0.4, 5, M.yellow, fxp, 6.6, z);
    sb.box(1.2, 0.5, 0.9, M.darkSteel, fxp, 6.2, z);
    this.hoist = new THREE.Group();
    const hookMat = M.darkSteel;
    for (const [dx, dz] of [[1.6, 0.6], [1.6, -0.6], [-1.6, 0.6], [-1.6, -0.6]]) { const c = new THREE.Mesh(G.cyl8, hookMat); c.scale.set(0.015, 1, 0.015); c.position.set(dx, 0.5, dz); c.userData.cable = true; this.hoist.add(c); }
    const bar = new THREE.Mesh(G.box, M.yellow); bar.scale.set(3.6, 0.12, 1.4); this.hoist.add(bar); this.hoistBar = bar;
    this.hoist.position.set(fxp, 0, z);
    scene.add(this.hoist);

    // ----- cabina de pintura -----
    const bx0 = 8, bx1 = 48, bz0 = z - 4.5, bz1 = z + 4.5, bh = 6.5, bc = (bx0 + bx1) / 2;
    sb.box(bx1 - bx0, bh, 0.15, M.booth, bc, bh / 2, bz0);
    sb.box(bx1 - bx0, 0.2, bz1 - bz0, M.booth, bc, bh, z);
    sb.box(bx1 - bx0, 0.02, bz1 - bz0 - 0.3, M.darkSteel, bc, 0.02, z);
    sb.box(bx1 - bx0, bh, 0.05, M.glassWall, bc, bh / 2, bz1);
    for (let x = bx0; x <= bx1; x += 2.5) sb.box(0.12, bh, 0.12, M.booth, x, bh / 2, bz1);
    sb.box(bx1 - bx0, 0.9, 0.16, M.booth, bc, 0.45, bz1);
    sb.box(bx1 - bx0, 0.5, 0.16, M.booth, bc, bh - 0.25, bz1);
    for (const ex of [bx0, bx1]) {
      sb.box(0.15, bh, 3.0, M.booth, ex, bh / 2, bz0 + 1.5);
      sb.box(0.15, bh, 3.0, M.booth, ex, bh / 2, bz1 - 1.5);
      sb.box(0.15, bh - 3.2, 3.0, M.booth, ex, 3.2 + (bh - 3.2) / 2, z);
    }
    for (let x = bx0 + 2; x < bx1; x += 4) sb.box(2.6, 0.03, 1.2, M.lightPanel, x, bh - 0.12, z);
    for (let x = bx0 + 5; x < bx1; x += 10) { sb.cyl(0.6, 6.5, M.steel, x, bh + 3.3, z - 2.5); sb.box(2.6, 1.4, 2.6, M.steel, x, bh + 0.8, z - 2.5); }
    // pretratamiento (arco de aspersión) estación 8
    for (const dx of [-1.6, 0, 1.6]) { const x = slotX(8) + dx; sb.box(0.12, 3, 0.12, M.steel, x, 1.5, z - 1.6); sb.box(0.12, 3, 0.12, M.steel, x, 1.5, z + 1.6); sb.box(0.12, 0.12, 3.3, M.steel, x, 3.0, z); }
    // ----- horno -----
    const ox0 = 48.5, ox1 = 61.5, oz0 = z - 3.2, oz1 = z + 3.2, oh = 4.5, oc = (ox0 + ox1) / 2;
    this.ovenGlow = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
    sb.box(ox1 - ox0, oh, 0.3, M.ovenPanel, oc, oh / 2, oz0);
    sb.box(ox1 - ox0, oh, 0.3, M.ovenPanel, oc, oh / 2, oz1);
    sb.box(ox1 - ox0, 0.3, oz1 - oz0 + 0.3, M.ovenPanel, oc, oh, z);
    for (const ex of [ox0, ox1]) { sb.box(0.3, oh, 1.6, M.ovenPanel, ex, oh / 2, oz0 + 0.8); sb.box(0.3, oh, 1.6, M.ovenPanel, ex, oh / 2, oz1 - 0.8); sb.box(0.3, oh - 2.8, 3.2, M.ovenPanel, ex, 2.8 + (oh - 2.8) / 2, z); }
    sb.box(ox1 - ox0 - 0.6, oh - 0.6, 0.05, this.ovenGlow, oc, oh / 2, oz0 + 0.2);
    sb.box(ox1 - ox0 - 0.6, 0.05, oz1 - oz0 - 0.6, this.ovenGlow, oc, oh - 0.2, z);
    for (let x = ox0 + 2; x < ox1 - 1; x += 3) sb.box(0.9, 0.5, 0.04, this.ovenGlow, x, 1.6, oz1 + 0.16);
    this.chimneys = [new THREE.Vector3(52, 13.6, z - 1.5), new THREE.Vector3(58, 13.6, z - 1.5)];
    for (const c of this.chimneys) sb.cyl(0.45, 13.6 - oh, M.steel, c.x, oh + (13.6 - oh) / 2, c.z);
    this.ovenWindows = [new THREE.Vector3(51, 1.8, oz1 + 0.3), new THREE.Vector3(56, 1.8, oz1 + 0.3), new THREE.Vector3(60, 1.8, oz1 + 0.3)];
    this.gauge = new CanvasPanel(512, 256, 2.0);
    this.gauge.mesh.position.set(oc, 3.5, oz1 + 0.17);
    scene.add(this.gauge.mesh);
    // ----- ensamble -----
    for (const dz of [-1.7, 1.7]) sb.box(38, 0.25, 0.2, M.yellow, 81, 4.6, z + dz);
    for (let x = 63; x <= 99; x += 6) for (const dz of [-1.7, 1.7]) sb.box(0.25, 4.6, 0.25, M.yellow, x, 2.3, z + dz * 1.0 + (dz > 0 ? 1.5 : -1.5));
    for (let x = 63; x <= 99; x += 6) for (const dz of [-1.7, 1.7]) sb.box(0.2, 0.2, 1.7, M.yellow, x, 4.6, z + dz + (dz > 0 ? 0.75 : -0.75));
    for (let i = 16; i <= 21; i++) {
      const x = slotX(i);
      for (const s of [-1, 1]) {
        sb.cyl(0.01, 1.8, M.black, x + 0.8, 3.7, z + s * 1.7);
        sb.box(0.15, 0.25, 0.15, M.darkSteel, x + 0.8, 2.75, z + s * 1.7);
        if (A.ok || (i === 19 && s < 0)) continue;
        sb.box(1.5, 0.9, 0.7, M.darkSteel, x - 1.4, 0.45, z + s * 3.1);
        for (let k = 0; k < 3; k++) sb.box(0.42, 0.25, 0.6, M.binBlue, x - 1.9 + k * 0.5, 1.03, z + s * 3.1);
      }
    }
    for (let k = 0; k < 6; k++) sb.cyl(0.34, 0.24, M.tire, slotX(18) - 1.5 + (k % 3) * 0.75, 0.15 + Math.floor(k / 3) * 0.25, z + 3.3);
    // mesa de matrimonio (powertrain)
    this.lift = new THREE.Group();
    const lt = new THREE.Mesh(G.box, M.lift); lt.scale.set(2.6, 0.12, 1.1); this.lift.add(lt);
    const eng = new THREE.Mesh(G.box, M.darkSteel); eng.scale.set(0.8, 0.45, 0.9); eng.position.set(0.9, 0.28, 0); this.lift.add(eng);
    this.lift.position.set(slotX(17), 0.2, z);
    scene.add(this.lift);
    sb.box(3.0, 0.15, 1.6, M.darkSteel, slotX(17), 0.08, z);
    // ----- calidad: túnel de luz -----
    this.qcMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff, toneMapped: false });
    const qx = slotX(22);
    const qb = new Batcher();
    for (const dx of [-1.8, -0.6, 0.6, 1.8]) {
      qb.box(0.12, 2.8, 0.12, this.qcMat, qx + dx, 1.4, z - 1.8); qb.box(0.12, 2.8, 0.12, this.qcMat, qx + dx, 1.4, z + 1.8); qb.box(0.12, 0.12, 3.7, this.qcMat, qx + dx, 2.8, z);
    }
    qb.build(scene);
    sb.box(4.6, 0.25, 0.25, M.black, qx, 3.0, z - 1.8); sb.box(4.6, 0.25, 0.25, M.black, qx, 3.0, z + 1.8);
    this.qcSign = new CanvasPanel(512, 192, 2.2);
    this.qcSign.mesh.position.set(slotX(23), 3.4, z + 1.9);
    scene.add(this.qcSign.mesh);
    sb.box(0.1, 3.2, 0.1, M.darkSteel, slotX(23) - 1.0, 1.6, z + 1.95); sb.box(0.1, 3.2, 0.1, M.darkSteel, slotX(23) + 1.0, 1.6, z + 1.95);
    this.drawQc(null);
    sb.build(scene);
  }

  bodyAt(slot) { return this.bodies.find((b) => b.slot === slot); }

  arrive() {
    for (const b of this.bodies) {
      b.slot++;
      if (b.slot >= this.N) b.reset(-1);
    }
    for (const b of this.bodies) {
      if (b.slot < 0) continue;
      this.onArrive?.(b);
      if (b.slot === 22 && b.defect) {
        S.kpi.defects++;
        if (b.marker) b.marker.dead = true;
        b.marker = this.fx.markers.add(b.g.position, 'RECHAZO: ' + b.defect, '#ff3030', { follow: b.g, scale: 1.6, labelY: 3.6 });
      }
      if (b.slot === 23) { if (!b.defect) S.kpi.produced++; this.drawQc(b); }
    }
  }

  drawQc(b) {
    const p = this.qcSign, ctx = p.ctx;
    const ok = !b || !b.defect;
    ctx.fillStyle = ok ? '#0d5f2f' : '#8f1010'; ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 64px ${FONT}`; ctx.fillText(ok ? 'UNIDAD OK' : 'RECHAZO', 256, 70);
    ctx.font = `500 32px ${FONT}`; ctx.fillText(ok ? 'Liberada a embarque' : b.defect, 256, 140, 490);
    p.update();
  }

  drawGauge() {
    const p = this.gauge, ctx = p.ctx, T = Math.round(S.ovenTemp);
    const hot = T > 200;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = hot ? '#ff3b30' : '#34c759'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('TERMÓMETRO LOCAL', 24, 18);
    ctx.font = `900 120px ${FONT}`; ctx.fillText(T + ' °C', 24, 70);
    ctx.fillStyle = '#888'; ctx.font = `500 28px ${FONT}`; ctx.fillText('Consigna 180 °C · lectura en campo', 24, 205);
    p.update();
  }

  update(dt, t) {
    const running = lineRunning();
    if (running) this.t += dt;
    if (this.t >= LINE.cycle) { this.t -= LINE.cycle; this.arrived = false; }
    const moving = this.t < LINE.move;
    if (!moving && !this.arrived) { this.arrived = true; this.arrive(); }
    const p = moving ? smooth(this.t / LINE.move) : 0;
    const workT = this.t - LINE.move;
    const X = (s) => (s >= this.N ? slotX(this.N - 1) + 13 : slotX(s));
    for (const b of this.bodies) {
      const s = b.slot;
      let x, y = LINE.bodyY;
      if (moving) { x = lerp(X(s), X(s + 1), p); if (s === -1) y = lerp(4.2, LINE.bodyY, p); }
      else { x = X(s); if (s === -1) y = 4.2; }
      b.g.position.set(x, y, LINE.z);
      const desired = s < 0 ? -1 : (!moving && workT > 2.2) ? s : s - 1;
      if (desired > b.shown) b.setShown(desired);
    }
    // grúa de alimentación
    const feed = this.bodyAt(-1);
    if (feed) {
      const hy = feed.g.position.y + 0.32;
      this.hoistBar.position.y = hy;
      this.hoist.children.forEach((c) => { if (c.userData.cable) { const len = 6.0 - hy; c.scale.y = len; c.position.y = hy + len / 2; } });
    }
    const working = running && !moving && workT > 0.4 && workT < LINE.cycle - LINE.move - 0.6;
    // robots
    for (const { r, slot } of this.robots) {
      let spray = null;
      if (r.type === 'paint') {
        const b = this.bodyAt(slot);
        spray = slot === 9 ? SEALER : slot <= 11 ? PRIMER_SPRAY : b ? b.color : null;
      }
      r.update(dt, t, working && !!this.bodyAt(slot), this.fx, spray, this.audio);
    }
    // pretratamiento
    if (working && Math.random() < dt * 30) {
      const s = Math.random() < 0.5 ? 1 : -1;
      _v.set(slotX(8) + rand(-1.6, 1.6), rand(0.6, 2.8), LINE.z + s * 1.5);
      _d.set(0, 0, -s * 1.5);
      this.fx.mist.emit(_v, 3, WATER, 1.2, 0.3, _d, 0.8);
    }
    // operarios
    const wmode = S.alarm ? 'alarm' : working ? 'work' : 'idle';
    this.workers.forEach(({ w }, i) => w.update(dt, t, wmode === 'alarm' ? (i % 3 === 0 ? 'alarm' : 'idle') : wmode));
    for (const k of this.walkers) {
      const w = k.w;
      w.root.position.x += k.v * dt;
      if (w.root.position.x > k.x1) k.v = -Math.abs(k.v);
      if (w.root.position.x < k.x0) k.v = Math.abs(k.v);
      w.root.rotation.y = k.v > 0 ? Math.PI / 2 : -Math.PI / 2; w.yaw = w.root.rotation.y;
      w.update(dt, t, 'walk');
    }
    // matrimonio
    const lp = working ? Math.sin(Math.PI * clamp((workT - 0.4) / 4.5, 0, 1)) : 0;
    this.lift.position.y = damp(this.lift.position.y, 0.2 + 0.55 * lp, 6, dt);
    // horno
    S.ovenTemp = damp(S.ovenTemp, S.ovenTarget ?? 180, 0.12, dt);
    const heat = clamp((S.ovenTemp - 180) / 140, 0, 1);
    this.ovenGlow.color.setRGB(1, 0.48 * (1 - heat) + 0.08, 0.1 * (1 - heat)).multiplyScalar(1 + heat * 1.5);
    if (S.ovenTemp > 235) {
      this.ovenSmokeT -= dt;
      if (this.ovenSmokeT <= 0) {
        this.ovenSmokeT = 0.25 - heat * 0.15;
        for (const c of this.chimneys) this.fx.smoke.emit(c, 0x2a2a2a, 2.2, 8, 1.4);
        if (S.ovenTemp > 270) { const w = this.ovenWindows[(Math.random() * 3) | 0]; this.fx.smoke.emit(w, 0x333333, 1.4, 6, 0.6); }
      }
    }
    this.gaugeT -= dt;
    if (this.gaugeT <= 0) { this.gaugeT = 0.5; const P = S.player; if (!P || Math.hypot(P.x - 55, P.z - LINE.z) < 45) this.drawGauge(); }
    // túnel de calidad
    const qb = this.bodyAt(22);
    const bad = qb && qb.defect && qb.shown >= 21 && !moving;
    this.qcMat.color.setHex(bad ? (Math.sin(t * 12) > 0 ? 0xff2020 : 0x550000) : 0xf4f8ff);
  }

  reset() {
    for (const b of this.bodies) { b.defect = null; b.burnt = false; b.marker = null; b.applyColor(); }
    this.robots.forEach(({ r }) => (r.mode = 'normal'));
    this.drawQc(null);
  }
}
const SEALER = new THREE.Color(0.5, 0.5, 0.5), PRIMER_SPRAY = new THREE.Color(0.6, 0.6, 0.58), WATER = new THREE.Color(0.35, 0.5, 0.65);
