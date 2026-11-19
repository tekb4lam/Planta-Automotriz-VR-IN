import os
FIX = os.environ.get('FIX') == '1'
import sys, re, json, numpy as np, trimesh, fast_simplification, pymeshlab
from lxml import etree
from trimesh.transformations import euler_matrix, translation_matrix

def parse(path, pkgroot):
    txt = open(path).read().replace('${prefix}', '')
    txt = re.sub(r'xacro:', 'xacro_', txt)
    txt = re.sub(r'xmlns:xacro="[^"]*"', '', txt)
    root = etree.fromstring(txt.encode())
    links, joints = {}, []
    for l in root.iter('link'):
        v = l.find('visual')
        if v is None: links[l.get('name')] = None; continue
        o = v.find('origin'); m = v.find('geometry/mesh')
        T = np.eye(4)
        if o is not None:
            xyz = [float(x) for x in o.get('xyz', '0 0 0').split()]; rpy = [float(x) for x in o.get('rpy', '0 0 0').split()]
            T = translation_matrix(xyz) @ euler_matrix(*rpy, 'sxyz')
        fn = m.get('filename').replace('package://', pkgroot + '/')
        links[l.get('name')] = (fn, T)
    for j in root.iter('joint'):
        o = j.find('origin'); a = j.find('axis'); lim = j.find('limit')
        xyz = [float(x) for x in o.get('xyz', '0 0 0').split()] if o is not None else [0, 0, 0]
        rpy = [float(x) for x in o.get('rpy', '0 0 0').split()] if o is not None else [0, 0, 0]
        joints.append(dict(name=j.get('name'), type=j.get('type'), parent=j.find('parent').get('link'), child=j.find('child').get('link'),
                           xyz=xyz, rpy=rpy, axis=[float(x) for x in a.get('xyz').split()] if a is not None else [1, 0, 0],
                           lower=float(lim.get('lower')) if lim is not None and lim.get('lower') else None, upper=float(lim.get('upper')) if lim is not None and lim.get('upper') else None))
    return links, joints

def load_link(fn, target_faces):
    sc = trimesh.load(fn, force='scene')
    parts = []
    for name, geom in sc.geometry.items():
        if not isinstance(geom, trimesh.Trimesh): continue
        T = np.eye(4)
        try:
            nodes = sc.graph.geometry_nodes.get(name, [])
            if nodes: T = sc.graph.get(nodes[0])[0]
        except Exception: pass
        g = geom.copy(); g.apply_transform(T)
        col = np.array([180, 180, 180, 255], dtype=np.uint8)
        try:
            mat = g.visual.material
            c = getattr(mat, 'baseColorFactor', None)
            if c is None: c = getattr(mat, 'diffuse', None)
            if c is None and hasattr(mat, 'main_color'): c = mat.main_color
            if c is not None:
                c = np.array(c, dtype=float)
                if c.max() <= 1.0: c = c * 255
                col = np.clip(c, 0, 255).astype(np.uint8)
        except Exception:
            try: col = np.array(g.visual.face_colors[0], dtype=np.uint8)
            except Exception: pass
        parts.append((g, col))
    ext = max((g.bounds[1] - g.bounds[0]).max() for g, _ in parts) if parts else 1
    if ext > 6:  # mallas en pulgadas
        for g, _ in parts: g.apply_scale(0.0254)
    total = sum(len(g.faces) for g, _ in parts)
    out = []
    for g, col in parts:
        tf = max(4, int(target_faces * len(g.faces) / max(total, 1)))
        if g.area < 1e-4 * sum(x.area for x, _ in parts): continue
        g.merge_vertices(merge_tex=True, merge_norm=True)
        v, f = g.vertices, g.faces
        if len(f) > tf:
            ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(np.asarray(v, dtype=np.float64), np.asarray(f, dtype=np.int32)))
            ms.meshing_merge_close_vertices()
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=int(tf), preservenormal=True, planarquadric=True, qualitythr=0.4, preserveboundary=True, autoclean=True)
            mm = ms.current_mesh(); v, f = mm.vertex_matrix(), mm.face_matrix()
        m = trimesh.Trimesh(v, f, process=True)
        if len(m.faces) == 0: continue
        if FIX: trimesh.repair.fix_normals(m, multibody=True)
        try: pass
        except Exception as e: print('fixn', e)
        try: m = trimesh.graph.smooth_shade(m, angle=np.radians(35), facet_minarea=1e9)
        except Exception as e: print('smooth fail', e)
        lc = col.astype(float).copy(); lc[:3] = ((lc[:3] / 255.0) ** 2.2) * 255.0  # sRGB -> lineal
        m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.tile(lc.astype(np.uint8), (len(m.vertices), 1)))
        out.append(m)
    if not out: return None
    m = trimesh.util.concatenate(out)
    m.merge_vertices = lambda *a, **k: None
    return m

def build(urdf, pkgroot, outglb, outjson, faces_per_link, color_override=None):
    links, joints = parse(urdf, pkgroot)
    scene = trimesh.Scene()
    children = {j['parent']: [] for j in joints}
    for j in joints: children.setdefault(j['parent'], []).append(j)
    allchild = {j['child'] for j in joints}
    base = [l for l in links if l not in allchild][0]
    info = {'base': base, 'joints': []}
    stats = {}
    def add_link(lname, parent_node):
        node = 'L_' + lname
        scene.graph.update(frame_from=parent_node, frame_to=node, matrix=np.eye(4))
        lv = links.get(lname)
        if lv:
            fn, T = lv
            m = load_link(fn, faces_per_link.get(lname, faces_per_link.get('*', 2000)))
            if m is not None:
                if color_override and lname in color_override:
                    lc = np.array(color_override[lname], dtype=float); lc[:3] = ((lc[:3] / 255.0) ** 2.2) * 255.0
                    m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.tile(lc.astype(np.uint8), (len(m.vertices), 1)))
                m.apply_transform(T)
                scene.add_geometry(m, geom_name='G_' + lname, node_name='M_' + lname, parent_node_name=node)
                stats[lname] = len(m.faces)
        for j in children.get(lname, []):
            jo = 'J_' + j['name']
            T = translation_matrix(j['xyz']) @ euler_matrix(*j['rpy'], 'sxyz')
            scene.graph.update(frame_from=node, frame_to=jo, matrix=T)
            jr = 'R_' + j['name']
            scene.graph.update(frame_from=jo, frame_to=jr, matrix=np.eye(4))
            if j['type'] != 'fixed': info['joints'].append({k: j[k] for k in ['name', 'axis', 'lower', 'upper', 'xyz', 'rpy']})
            add_link(j['child'], jr)
    add_link(base, scene.graph.base_frame)
    scene.export(outglb, include_normals=False)
    json.dump(info, open(outjson, 'w'), indent=1)
    print(outglb, stats, 'total faces', sum(stats.values()))

if __name__ == '__main__':
    import ast
    build(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], ast.literal_eval(sys.argv[5]), ast.literal_eval(sys.argv[6]) if len(sys.argv) > 6 else None)
