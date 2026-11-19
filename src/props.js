import * as THREE from 'three';
import { A } from './assets.js';
import { LINE, slotX } from './config.js';

// Utilería realista (Poly Haven, CC0) instanciada para no multiplicar draw calls
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function inst(scene, key, list) {
  const g = A[key];
  if (!g || !list.length) return;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
    list.forEach(([x, y, z, ry = 0, s = 1], i) => {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s)).multiply(o.matrixWorld);
      im.setMatrixAt(i, _m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    scene.add(im);
  });
}

export function placeProps(scene, W) {
  if (!A.ok) return;
  const z = LINE.z;
  // estanterías de lado de línea en ensamble, con cajas
  const shelves = [], boxes = [];
  for (let i = 16; i <= 21; i++) for (const s of [-1, 1]) {
    if (i === 19 && s < 0) continue;
    const x = slotX(i) - 1.6, zz = z + s * 3.35;
    shelves.push([x, 0, zz, s > 0 ? Math.PI : 0, 0.09]);
    boxes.push([x - 0.25, 0.02, zz + s * 0.0, Math.random() * 0.3, 1.0], [x + 0.25, 0.02, zz, Math.random() * 0.3, 1.0]);
  }
  inst(scene, 'shelves', shelves);
  // cajas de cartón (lado de línea y salida de prensas)
  for (let k = 0; k < 6; k++) boxes.push([-44 + (k % 3) * 0.6, (k > 2 ? 0.45 : 0) + 0.02, -21.5, Math.random() * 0.4, 1.3]);
  for (let k = 0; k < 8; k++) boxes.push([118 - (k % 4) * 0.6, (k > 3 ? 0.45 : 0) + 0.02, 30 + (k % 2) * 0.1, Math.random() * 0.4, 1.3]);
  inst(scene, 'box', boxes);
  // carros de herramientas y carros de soldadura (mantenimiento)
  inst(scene, 'toolCart', [[-97, 0, -8.5, 0.3], [64, 0, -0.8, Math.PI], [101, 0, -0.9, Math.PI], [-60, 0, -26.2, 0]]);
  inst(scene, 'weldCart', [[-36, 0, -11.4, 0.2], [-14, 0, -11.4, -0.3], [-2, 0, -11.2, 0.5]]);
  // tambores (aceite de prensa / químicos de pintura)
  inst(scene, 'barrel', [[-98.5, 0, -11.2, 0], [-97.8, 0, -11.0, 1], [-98.4, 0, -10.3, 2], [47, 0, -11.6, 0], [47.7, 0, -11.6, 1], [62.5, 0, -10.2, 0.5]]);
  // señal de piso mojado junto a pintura
  inst(scene, 'wetSign', [[30, 0, 2.2, 0.4], [96, 0, 2.0, -0.6]]);
  // cámaras de seguridad en columnas (CCTV: también son activos OT/IoT)
  const cams = [];
  for (const c of W.columns) if (c.z === 7.5 && ((c.x / 24) % 2 !== 0)) cams.push([c.x, 6.4, c.z - 0.3, Math.PI]);
  inst(scene, 'cam', cams);
  // tableros eléctricos en muro norte y columnas
  const ub = [];
  for (let x = -90; x <= 100; x += 38) ub.push([x, 1.0, -49.75, 0]);
  for (const c of W.columns) if (c.z === -30 && c.x > -100) ub.push([c.x, 1.0, c.z + 0.3, 0]);
  inst(scene, 'ubox', ub);
}
