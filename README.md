# Planta Automotriz VR IN · Simulador de riesgos OT

Entorno WebXR (Three.js) para Meta Quest 3 de **INET · Cybersecurity Experts**: una planta automotriz a escala real donde se activan ataques OT y se ve su impacto.

**Demo en vivo:** https://tekb4lam.github.io/Planta-Automotriz-VR-IN/ — ábrela en Meta Quest Browser y pulsa "Entrar a VR".

La app es `index.html` + la carpeta `assets/` (modelos 3D y texturas optimizados para Quest 3, ~4.5 MB).
Si `assets/` no está disponible, la planta se dibuja con geometría procedural.

Modelos: robots KUKA KR 210 y ABB IRB 5400 con ejes reales, autos con LOD, operarios con esqueleto animado y utilería de Poly Haven. Ver **CREDITOS.md** (licencias y ligas).

## Abrirlo en el Quest 3
WebXR solo funciona en un contexto seguro (HTTPS o localhost).
- **Opción A (recomendada):** abre la URL de GitHub Pages de arriba en Meta Quest Browser → "Entrar a VR".
- **Opción B (sin internet, con cable):** en tu PC `npx http-server dist -p 8080`, conecta el visor por USB y ejecuta `adb reverse tcp:8080 tcp:8080`; en el Quest abre `http://localhost:8080/planta-automotriz-vr.html`.

## Controles en VR
- Mano izquierda: tablet del instructor (botón **X** la muestra/oculta, **Y** muestra la capa de red OT).
- Mano derecha: láser + gatillo para pulsar botones de la tablet.
- Stick izquierdo: caminar (grip izquierdo = correr). Stick derecho ↑: teletransporte en arco; ←/→: giro de 30°.

## Controles en escritorio
WASD/flechas para caminar, arrastrar para mirar, 1–6 ataques, F defensas, N red OT, V siguiente zona, R restablecer.

## Editar
`npm install && node build.mjs` regenera `index.html`; haz commit y push para actualizar Pages.
`tools/robot2glb.py` convierte robots URDF a GLB y `tools/ik.py` calcula sus trayectorias. Parámetros en `src/config.js` (marca, costo por minuto de paro, JPH, ubicaciones).
Escenarios, textos, técnicas ATT&CK for ICS y mitigaciones en `src/scenarios.js`.
