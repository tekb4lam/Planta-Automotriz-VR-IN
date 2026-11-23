import sys, os, tempfile, time, trimesh, pymeshlab, numpy as np
src, out, target = sys.argv[1], sys.argv[2], int(sys.argv[3])
t0 = time.time()
sc = trimesh.load(src, force='scene')
m = trimesh.util.concatenate([g for g in sc.dump()]) if len(sc.geometry) > 1 else list(sc.dump())[0]
print('src tris', len(m.faces))
d = tempfile.mkdtemp()
obj = os.path.join(d, 'm.obj')
m.export(obj)
ms = pymeshlab.MeshSet(); ms.load_new_mesh(obj)
print('loaded v', ms.current_mesh().vertex_number(), 'wedge', ms.current_mesh().has_wedge_tex_coord(), 'vtc', ms.current_mesh().has_vertex_tex_coord())
if ms.current_mesh().has_vertex_tex_coord() and not ms.current_mesh().has_wedge_tex_coord(): ms.compute_texcoord_transfer_vertex_to_wedge()
ms.meshing_merge_close_vertices(threshold=pymeshlab.PercentageValue(0.01))
print('merged v', ms.current_mesh().vertex_number())
if ms.current_mesh().face_number() > 300000:
    # primera pasada sin textura en mallas enormes (solo topología), luego con textura
    pass
ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=target, qualitythr=0.4, preserveboundary=False, boundaryweight=1.0, optimalplacement=True, preservenormal=True, planarquadric=True)
print('dec tris', ms.current_mesh().face_number(), round(time.time()-t0,1), 's')
o2 = os.path.join(d, 'd.obj'); ms.save_current_mesh(o2)
m2 = trimesh.load(o2, force='mesh')
m2.export(out)
print('wrote', out)
