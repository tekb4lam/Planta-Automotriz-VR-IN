# Créditos y licencias de los modelos

Uso **no comercial** (concientización en ciberseguridad OT). Todos los recursos se optimizaron para Meta Quest 3
(mallas simplificadas, compresión meshopt, texturas WebP de 512–1024 px).

| Recurso | Uso en la planta | Autor / fuente | Licencia |
|---|---|---|---|
| KUKA KR 210 L150 (`assets/models/kr210.glb`) | Robots de soldadura de punto y manipulación | ROS-Industrial `kuka_experimental` – https://github.com/ros-industrial/kuka_experimental | BSD |
| ABB IRB 5400 (`assets/models/irb5400.glb`) | Robots de pintura | ROS-Industrial `abb` – https://github.com/ros-industrial/abb | Apache-2.0 |
| Car Concept (`car_hi.glb`, `car_lo.glb`) | Carrocerías en todas las etapas | Eric Chadwick, Khronos glTF Sample Assets – https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept (basado en un modelo CC0 de "Unity Fan") | CC BY 4.0 |
| Operario "Paco" (`rol_mantenimiento.glb`) | Técnicos de mantenimiento (y operarios de línea mientras no exista `rol_linea.glb`) | Generado por Michel Loranca con Meshy AI | Propio |
| Personajes `rol_calidad.glb`, `rol_supervisor.glb`, `rol_oficina.glb`, `rol_sala_control_1.glb`, `rol_sala_control_2.glb` | Inspectores, supervisor, personal de TI y operadores de sala de control | Generados por Michel Loranca con Meshy AI | Propio |
| Equipos `montacargas.glb`, `agv.glb`, `rack_servidores.glb`, `tablero_plc.glb` | Montacargas, AGV remolcador, racks de TI/OT y gabinetes PLC | Generados por Michel Loranca con Meshy AI | Propio |
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
- **Tamaño:** cualquier resolución; aquí se simplifica a ~3–22 mil triángulos y texturas de 1024 px.
  Las mallas de Meshy tienen muchas costuras de UV, por eso se simplifican con `tools/texdec.py` (PyMeshLab, respeta la textura):
  `python3 tools/texdec.py entrada.glb /tmp/sal.glb 6000 && node optimize.mjs /tmp/sal.glb assets/models/salida.glb 1 '{"tex":1024}'`.

### Archivos por rol (se cargan solos si existen en `assets/models/`)

| Archivo | Rol | Si no existe se usa |
|---|---|---|
| `rol_linea.glb` | Operarios de ensamble y pasillos | `rol_mantenimiento.glb` (Paco) |
| `rol_mantenimiento.glb` | Técnicos que caminan por la nave (Paco) | `rol_linea.glb` |
| `rol_calidad.glb` | Inspectores de calidad | respaldo con polo |
| `rol_sala_control_1.glb`, `rol_sala_control_2.glb` | Operadores sentados en sala de control (se alternan) | respaldo con polo y diadema |
| `rol_supervisor.glb` | Supervisor de pie en sala de control | `rol_calidad.glb` |
| `rol_oficina.glb` | Personal de TI (incluida la víctima del phishing) | `rol_supervisor.glb` |

### Equipos (opcionales; si faltan se usa la versión procedural)

| Archivo | Uso | Orientación esperada |
|---|---|---|
| `prensa.glb` | Opcional (desactivado): la prensa de Meshy viene en una sola malla con el carro fijo y, simplificada para Quest, se ve arrugada de cerca; se usa la prensa procedural con transfer animado | frente en +Z |
| `montacargas.glb` | Montacargas estacionados en almacén | horquillas hacia −X |
| `agv.glb` | Flota de 6 AGV (tractor + carro, ~3.2 m) | frente hacia −X |
| `rack_servidores.glb` | Racks de sala de control, oficina TI y firewall (los LEDs se añaden encima) | frente en +Z |
| `tablero_plc.glb` | Gabinetes PLC de cada línea (LED de estado y etiqueta encima) | frente en +Z |

Animaciones que se aprovechan si vienen en el GLB: *Walking*, *Running*, *Idle* y *Typing/Sitting*. Las poses de trabajo,
sentado y alarma se generan por código para cualquier esqueleto Mixamo.

## Narración y efectos de sonido (ElevenLabs)

- **Voz:** "Angelica" de la biblioteca de voces de ElevenLabs (español mexicano), modelo **Eleven v4** con *Audio Tags* de emoción (`[alarmed]`, `[relieved]`, `[whispers]`, …).
- **Efectos:** generados con *Sound Effects* de ElevenLabs (correo, tecleo, virus, choque de troquel, alarma de incendio, tormenta de red, etc.).
- **Guion:** `tools/narracion.json` (intro, un clip por paso, clip de bloqueo cuando las defensas están activas y cierre con "cómo se evitaba").
- **Regenerar:** `XI_API_KEY=tu_clave python3 tools/gen_audio.py` (usa `--only clip1,clip2 --force` para rehacer clips concretos). La clave se lee solo de la variable de entorno; nunca se guarda en el repositorio.
- **En la app:** Opciones → "Narradora y efectos de los escenarios". Con la narradora activa, cada paso del escenario espera a que termine la frase anterior; el ruido ambiente baja mientras habla.

## Controles en VR

- Modelos de los controles Meta Quest Touch Plus (Quest 3), Touch Plus v2, Touch v3 (Quest 2) y genérico: **WebXR Input Profiles** (Amazon / W3C Immersive Web, licencia MIT), servidos localmente desde `assets/xr-profiles/`. three.js `XRControllerModelFactory` elige el modelo según el perfil que reporta el visor y anima gatillo, grip, botones y joystick.
