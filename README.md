# Planta Automotriz VR IN · Simulador de riesgos OT

Entorno WebXR (Three.js) para Meta Quest 3 de **INET · Cybersecurity Experts**: una planta automotriz a escala real donde se activan ataques OT y se ve su impacto.

**Demo en vivo:** https://tekb4lam.github.io/Planta-Automotriz-VR-IN/ — ábrela en Meta Quest Browser y pulsa "Entrar a VR".

Todo vive en un solo archivo autocontenido (`index.html`, copia en `dist/`).

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
`npm install && node build.mjs` regenera `index.html` y `dist/`; haz commit y push para actualizar Pages. Parámetros en `src/config.js` (marca, costo por minuto de paro, JPH, ubicaciones).
Escenarios, textos, técnicas ATT&CK for ICS y mitigaciones en `src/scenarios.js`.
