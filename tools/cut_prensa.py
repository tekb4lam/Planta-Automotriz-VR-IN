# Recorta la ventana del carro de la prensa de Meshy: python3 tools/cut_prensa.py x0 x1 y0 y1 z0 z1 (lee prensa_raw.glb, escribe prensa_cut.glb)
# Valores usados: -0.24 0.44 -0.33 0.42 -0.40 0.62
import trimesh, numpy as np, sys
x0,x1,y0,y1,z0,z1 = map(float, sys.argv[1:7])
sc = trimesh.load('prensa_raw.glb')
for name, g in sc.geometry.items():
    c = g.triangles_center
    inside = (c[:,0]>x0)&(c[:,0]<x1)&(c[:,1]>y0)&(c[:,1]<y1)&(c[:,2]>z0)&(c[:,2]<z1)
    print(name, 'removed', inside.sum(), 'of', len(c))
    g.update_faces(~inside); g.remove_unreferenced_vertices()
sc.export('prensa_cut.glb')
