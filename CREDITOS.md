# Créditos y licencias de los modelos

Uso **no comercial** (concientización en ciberseguridad OT). Todos los recursos se optimizaron para Meta Quest 3
(mallas simplificadas, compresión meshopt, texturas WebP de 512–1024 px).

| Recurso | Uso en la planta | Autor / fuente | Licencia |
|---|---|---|---|
| KUKA KR 210 L150 (`assets/models/kr210.glb`) | Robots de soldadura de punto y manipulación | ROS-Industrial `kuka_experimental` – https://github.com/ros-industrial/kuka_experimental | BSD |
| ABB IRB 5400 (`assets/models/irb5400.glb`) | Robots de pintura | ROS-Industrial `abb` – https://github.com/ros-industrial/abb | Apache-2.0 |
| Car Concept (`car_hi.glb`, `car_lo.glb`) | Carrocerías en todas las etapas | Eric Chadwick, Khronos glTF Sample Assets – https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept (basado en un modelo CC0 de "Unity Fan") | CC BY 4.0 |
| Operario "Paco" (`rol_linea.glb`) | Operarios de ensamble y personal que camina por los pasillos | Generado por Michel Loranca con Meshy AI | Propio |
| Personaje con esqueleto (`worker.glb`) | Operarios (casco y chaleco añadidos por código) | Personaje Mixamo de los ejemplos de three.js – https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf | Términos de Mixamo (Adobe) |
| Texturas PBR: concreto de hangar, lámina perfilada, lámina corrugada, placa azul, placa antiderrapante, panel metálico | Piso, muros, techo, prensas, plataforma, cabina y horno | Poly Haven – https://polyhaven.com/textures | CC0 |
| HDRI `empty_warehouse_01` | Iluminación y reflejos | Poly Haven – https://polyhaven.com/a/empty_warehouse_01 | CC0 |
| Estantería, carro de herramientas, carro de soldar, cajas, tambores, señal de piso mojado, cámara de seguridad, tablero eléctrico | Utilería | Poly Haven – https://polyhaven.com/models | CC0 |

Las cinemáticas de los robots se calcularon con `tools/ik.py` a partir de los URDF originales (ejes reales de cada articulación).

## Para cambiar o mejorar modelos

- **Operarios más realistas:** cualquier personaje de https://www.mixamo.com comparte el mismo esqueleto `mixamorig`;
  descárgalo como FBX, conviértelo a GLB (Blender) con las animaciones *Idle* y *Walking* y reemplaza `assets/models/worker.glb`.
- **Personajes y vehículos CC0 estilizados:** https://quaternius.com/packs/ultimatemodularcharacters.html , https://quaternius.com/packs/cars.html
- **Autos realistas (verifica la licencia de cada modelo):** https://sketchfab.com/search?features=downloadable&q=sedan&type=models
  y la serie de autos concepto CC0 de "Unity Fan", p. ej. https://sketchfab.com/3d-models/free-concept-car-004-public-domain-cc0-4cba124633eb494eadc3bb0c4660ad7e
- **Montacargas y equipo:** https://sketchfab.com/search?features=downloadable&q=forklift&type=models ,
  https://sketchfab.com/search?features=downloadable&q=industrial+press&type=models
- **Más robots con ejes separados (URDF):** https://github.com/ros-industrial/fanuc (p. ej. R-2000iC), https://github.com/ros-industrial/abb (IRB 6640)

Para optimizar un modelo nuevo: `node optimize.mjs entrada.glb assets/models/salida.glb 0.3 '{"tex":512}'`.

## Usar modelos creados con Meshy AI

Sí sirven. Recomendaciones para que se integren sin retrabajo:

- **Personas (operadores, ingenieros, operarios):** genera el personaje en pose T o A, texturizado, y usa el
  auto-rig de Meshy. Al descargar, elige **GLB** con la plantilla de esqueleto **Mixamo**: el código ya anima los huesos
  `mixamorig*` (caminar, estar de pie, sentado tecleando, alarma). Incluye, si puedes, las animaciones *Idle*, *Walking* y *Typing/Sitting*.
- **Máquinas con partes móviles (prensas, robots, puertas):** genera **cada pieza móvil por separado**
  (p. ej. marco de prensa y carro/slide). Si viene en una sola malla, se puede cortar por planos, pero queda mejor separada.
- **Mobiliario y equipo estático (escritorios, racks, consolas):** una sola malla está bien.
- **Tamaño:** cualquier resolución; aquí se simplifica a ~5–25 mil triángulos y texturas de 512–1024 px con `optimize.mjs`.

### Archivos por rol (se cargan solos si existen en `assets/models/`)

| Archivo | Rol | Si no existe se usa |
|---|---|---|
| `rol_linea.glb` | Operarios de ensamble y pasillos | personaje de respaldo con overol pintado |
| `rol_mantenimiento.glb` | Técnicos que caminan por la nave | `rol_linea.glb` |
| `rol_calidad.glb` | Inspectores de calidad | respaldo con polo |
| `rol_sala_control.glb` | Operadores sentados en sala de control | respaldo con polo y diadema |
| `rol_supervisor.glb` | Supervisor de pie en sala de control | respaldo con camisa |
| `rol_oficina.glb` | Personal de TI (incluida la víctima del phishing) | respaldo con camisa |

Animaciones que se aprovechan si vienen en el GLB: *Walking*, *Running*, *Idle* y *Typing/Sitting*. Las poses de trabajo,
sentado y alarma se generan por código para cualquier esqueleto Mixamo.
