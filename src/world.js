import * as THREE from 'three';
import { B, LINE, PRESS, WALK, AGVP, ROOMS, PLATFORM, slotX, ZONES } from './config.js';
import { Batcher, G, M, CanvasPanel, makeSign, rand, emissiveMat, FONT, roundRect, corrugatedTexture } from './util.js';
import { S } from './state.js';

export function buildWorld(scene) {
  const W = { nodes: {}, cabinets: {}, zoneSigns: {}, andons: {}, screens: {}, columns: [] };
  const sb = new Batcher();
  const root = new THREE.Group();
  root.name = 'static';
  scene.add(root);

  // ---------- Piso ----------
  const fw = B.x1 - B.x0, fd = B.z1 - B.z0;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    const t = M.concrete[k]; if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(fw / (M.concrete.userData.tile || 4), fd / (M.concrete.userData.tile || 4));
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), M.concrete);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  root.add(floor);

  // ---------- Muros ----------
  const mkWall = (len, x, z, ry) => {
    let mat;
    if (M.wallPBR) {
      mat = M.wallPBR.clone();
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (mat[k]) { mat[k] = mat[k].clone(); mat[k].repeat.set(len / 3, B.h / 3); mat[k].needsUpdate = true; }
    } else {
      const tex = corrugatedTexture();
      tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(len / 2.5, 1);
      mat = new THREE.MeshLambertMaterial({ map: tex });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, B.h), mat);
    m.position.set(x, B.h / 2, z); m.rotation.y = ry;
    root.add(m);
  };
  mkWall(fw, 0, B.z0, 0);
  mkWall(fw, 0, B.z1, Math.PI);
  mkWall(fd, B.x0, 0, Math.PI / 2);
  mkWall(fd, B.x1, 0, -Math.PI / 2);
  // zócalo de concreto
  sb.box(fw, 1.2, 0.3, M.darkSteel, 0, 0.6, B.z0 + 0.15);
  sb.box(fw, 1.2, 0.3, M.darkSteel, 0, 0.6, B.z1 - 0.15);
  sb.box(0.3, 1.2, fd, M.darkSteel, B.x0 + 0.15, 0.6, 0);
  sb.box(0.3, 1.2, fd, M.darkSteel, B.x1 - 0.15, 0.6, 0);
  // puertas (aberturas luminosas hacia el exterior)
  const outside = new THREE.MeshBasicMaterial({ color: 0xdfefff, fog: false });
  sb.box(0.05, 5, 6.5, outside, B.x1 - 0.35, 2.5, LINE.z);
  sb.box(0.05, 4, 3.6, outside, B.x0 + 0.35, 2, (WALK.z0 + WALK.z1) / 2);
  sb.box(0.3, 0.4, 7.2, M.yellow, B.x1 - 0.4, 5.2, LINE.z);
  sb.box(0.3, 0.4, 4.2, M.yellow, B.x0 + 0.4, 4.2, (WALK.z0 + WALK.z1) / 2);

  // ---------- Techo, armaduras, luminarias ----------
  if (M.roof.map && M.roof.userData.tile) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (M.roof[k]) M.roof[k].repeat.set(fw / 3, fd / 3);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), M.roof);
  roof.rotation.x = Math.PI / 2; roof.position.y = B.h;
  root.add(roof);
  for (let x = B.x0 + 6; x < B.x1; x += 12) {
    sb.box(0.35, 0.5, fd, M.beam, x, B.h - 0.4, 0);
    sb.box(0.25, 0.3, fd, M.beam, x, B.h - 2.2, 0);
    for (let z = B.z0 + 2.5; z < B.z1; z += 5) sb.box(0.12, 1.7, 0.12, M.beam, x, B.h - 1.3, z, 0, 0.0, 0.5);
  }
  for (let z = B.z0 + 5; z < B.z1; z += 10) sb.box(fw, 0.25, 0.2, M.beam, 0, B.h - 0.25, z);
  for (let z = -40; z <= 40; z += 20) sb.box(fw - 10, 0.02, 2.2, M.skylight, 0, B.h - 0.02, z);
  for (let x = B.x0 + 12; x < B.x1; x += 12) {
    for (let z = B.z0 + 5; z < B.z1; z += 10) {
      sb.cyl(0.42, 0.35, M.darkSteel, x, 11.6, z);
      sb.cyl(0.38, 0.04, M.lightPanel, x, 11.41, z);
      sb.box(0.02, 2.2, 0.02, M.darkSteel, x, 12.9, z);
    }
  }

  // ---------- Columnas ----------
  const colZ = [-30, 7.5, 25];
  for (let x = -108; x <= 108; x += 24) {
    for (const z of colZ) {
      if (x < -100 && z < 0) continue;
      sb.box(0.5, B.h, 0.5, M.column, x, B.h / 2, z);
      sb.box(0.62, 1.2, 0.62, M.hazard, x, 0.6, z);
      W.columns.push(new THREE.Vector3(x, 0, z));
      if ((x / 24) % 2 === 0) { sb.cyl(0.09, 0.5, M.ext, x + 0.36, 1.1, z); sb.box(0.25, 0.18, 0.02, makeRedSignMat(), x + 0.36, 1.6, z + 0.26); }
    }
  }

  // ---------- Pasillos peatonales ----------
  const walk = (x0, x1, z0, z1) => {
    sb.box(x1 - x0, 0.01, z1 - z0, M.greenFloor, (x0 + x1) / 2, 0.006, (z0 + z1) / 2);
    const lw = 0.12;
    if (x1 - x0 > z1 - z0) {
      sb.box(x1 - x0, 0.01, lw, M.yellowPaint, (x0 + x1) / 2, 0.012, z0);
      sb.box(x1 - x0, 0.01, lw, M.yellowPaint, (x0 + x1) / 2, 0.012, z1);
    } else {
      sb.box(lw, 0.01, z1 - z0, M.yellowPaint, x0, 0.012, (z0 + z1) / 2);
      sb.box(lw, 0.01, z1 - z0, M.yellowPaint, x1, 0.012, (z0 + z1) / 2);
    }
  };
  walk(B.x0 + 1, B.x1 - 1, WALK.z0, WALK.z1);
  walk(-104, -100, -48, WALK.z0);
  // flechas / pasos peatonales sobre el carril AGV
  for (let x = -60; x <= 80; x += 70) for (let k = 0; k < 6; k++) sb.box(0.5, 0.01, 2.6, M.yellowPaint, x + k * 0.9, 0.012, WALK.z1 + 1.6);
  // carril AGV (cinta guía)
  const tape = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    sb.add(G.box, M.hazard, (x0 + x1) / 2, 0.01, (z0 + z1) / 2, 0, -a, 0, len, 0.01, 0.08);
  };
  tape(AGVP.x0, AGVP.zE, AGVP.x1, AGVP.zE); tape(AGVP.x1, AGVP.zE, AGVP.x1, AGVP.zW);
  tape(AGVP.x1, AGVP.zW, AGVP.x0, AGVP.zW); tape(AGVP.x0, AGVP.zW, AGVP.x0, AGVP.zE);

  // ---------- Plataforma de observación ----------
  const P = PLATFORM;
  sb.box(P.x1 - P.x0, 0.2, P.z1 - P.z0, M.plate, (P.x0 + P.x1) / 2, P.y - 0.1, (P.z0 + P.z1) / 2);
  for (const [x, z] of [[P.x0 + 0.3, P.z0 + 0.3], [P.x1 - 0.3, P.z0 + 0.3], [P.x0 + 0.3, P.z1 - 0.3], [P.x1 - 0.3, P.z1 - 0.3]]) sb.box(0.3, P.y, 0.3, M.column, x, P.y / 2, z);
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
    sb.add(G.box, M.yellow, (x0 + x1) / 2, P.y + 1.05, (z0 + z1) / 2, 0, -a, 0, len, 0.06, 0.06);
    sb.add(G.box, M.yellow, (x0 + x1) / 2, P.y + 0.55, (z0 + z1) / 2, 0, -a, 0, len, 0.04, 0.04);
    for (let t = 0; t <= 1.0001; t += 1 / Math.max(1, Math.round(len / 1.5))) sb.box(0.05, 1.05, 0.05, M.yellow, x0 + (x1 - x0) * t, P.y + 0.52, z0 + (z1 - z0) * t);
  };
  rail(P.x0, P.z0, P.x1, P.z0); rail(P.x0, P.z1, P.x1, P.z1); rail(P.x0, P.z0, P.x0, P.z1); rail(P.x1, P.z0, P.x1, P.z1 - 1.6);
  // escalera
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    sb.box(0.5, 0.06, 1.4, M.plate, P.x1 + 0.3 + t * 13, P.y * (1 - t) - 0.03, P.z1 - 0.8);
  }
  sb.add(G.box, M.yellow, P.x1 + 6.8, P.y / 2 + 1, P.z1 - 1.55, 0, 0, -Math.atan2(P.y, 13), 15.8, 0.06, 0.06);
  sb.add(G.box, M.steel, P.x1 + 6.8, P.y / 2 - 0.2, P.z1 - 0.8, 0, 0, -Math.atan2(P.y, 13), 15.8, 0.25, 1.5);

  // ---------- Almacén (racks instanciados) ----------
  buildRacks(root);
  // montacargas estacionados
  for (const [x, z, r] of [[-60, 34, 0], [20, 34.2, Math.PI], [70, 42.7, 0.3]]) forklift(sb, x, z, r);

  // ---------- Oficinas IT ----------
  const O = ROOMS.office;
  roomShell(sb, O, { glassE: true, glassS: true, door: 'S', doorAt: -108 });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = -116 + c * 3.2, z = -45 + r * 4;
    sb.box(1.6, 0.05, 0.8, M.deskTop, x, 0.75, z); sb.box(1.5, 0.72, 0.05, M.desk, x, 0.37, z - 0.35);
    sb.box(0.55, 0.35, 0.03, M.screenOff, x, 1.0, z - 0.25);
    sb.box(0.5, 0.5, 0.5, M.chair, x, 0.45, z + 0.65);
  }
  // laptop víctima de phishing
  sb.box(1.6, 0.05, 0.8, M.deskTop, -110, 0.75, -40.2); sb.box(1.5, 0.72, 0.05, M.desk, -110, 0.37, -40.55);
  sb.box(0.42, 0.02, 0.3, M.darkSteel, -110, 0.785, -40.05);
  const lap = new CanvasPanel(512, 320, 0.4);
  lap.mesh.position.set(-110, 0.92, -40.22); lap.mesh.rotation.x = -0.25;
  root.add(lap.mesh);
  W.screens.laptop = lap;
  // racks de servidores IT
  for (let i = 0; i < 3; i++) serverRack(sb, root, -118.2, -47.5 + i * 0.9, Math.PI / 2, W);
  W.nodes.laptop = new THREE.Vector3(-110, 1.0, -40);
  W.nodes.itsrv = new THREE.Vector3(-117.8, 2.1, -46.6);
  const itSign = makeSign(['RED CORPORATIVA (IT)', 'Correo · ERP · Usuarios'], 4.5, { bg: '#1d3557', stripe: '#4cc9f0' });
  itSign.position.set(-112, 3.6, -34.9); root.add(itSign);

  // ---------- Firewall IT/OT (DMZ) ----------
  sb.box(0.7, 2.0, 0.8, M.serverRack, -107, 1.0, -33);
  sb.box(0.6, 0.18, 0.7, M.fw, -107, 1.6, -32.95);
  sb.box(0.6, 0.18, 0.7, M.darkSteel, -107, 1.3, -32.95);
  W.nodes.fw = new THREE.Vector3(-107, 1.8, -33);
  const fwSign = makeSign(['FIREWALL IT/OT', 'DMZ industrial (Nivel 3.5)'], 2.6, { bg: '#7a0d16', stripe: '#ffd166' });
  fwSign.position.set(-107, 2.6, -32.55); root.add(fwSign);
  W.fwLed = emissiveMat(0x33ff66, 2);
  sb.box(0.05, 0.05, 0.02, W.fwLed, -106.9, 1.6, -32.59);

  // ---------- Sala de control ----------
  const C = ROOMS.control;
  roomShell(sb, C, { glassE: true, glassS: true, glassN: true, door: 'E', doorAt: -23 });
  const vw = { center: new CanvasPanel(1280, 720, 4.6), left: new CanvasPanel(1024, 640, 3.6), right: new CanvasPanel(1024, 512, 3.6) };
  vw.center.mesh.position.set(C.x0 + 0.25, 2.1, -23);
  vw.left.mesh.position.set(C.x0 + 0.25, 1.95, -28.2);
  vw.right.mesh.position.set(C.x0 + 0.25, 1.95, -17.8);
  for (const k in vw) { vw[k].mesh.rotation.y = Math.PI / 2; root.add(vw[k].mesh); }
  sb.box(0.1, 3.0, 15.4, M.black, C.x0 + 0.12, 1.95, -23);
  W.screens.scada = vw.center; W.screens.net = vw.left; W.screens.kpiCtrl = vw.right;
  // consolas de operador
  for (const x of [-114, -110.8]) {
    for (let z = -28; z <= -18; z += 3.4) {
      sb.box(1.0, 0.05, 2.6, M.deskTop, x, 0.76, z); sb.box(0.9, 0.72, 2.5, M.desk, x + 0.05, 0.38, z);
      for (const dz of [-0.8, 0, 0.8]) {
        const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), vw.center.mat);
        mon.position.set(x - 0.32, 1.06, z + dz); mon.rotation.y = Math.PI / 2 + dz * 0.25; root.add(mon);
        sb.box(0.04, 0.42, 0.66, M.black, x - 0.35, 1.06, z + dz, dz * 0.25);
      }
      sb.box(0.55, 0.5, 0.55, M.chair, x + 0.75, 0.45, z);
    }
  }
  seatedOperator(root, -113.25, -24.6); seatedOperator(root, -110.05, -21.2);
  // servidores SCADA/MES y estación de ingeniería
  serverRack(sb, root, -105.9, -16.2, -Math.PI / 2, W);
  serverRack(sb, root, -105.9, -17.1, -Math.PI / 2, W);
  sb.box(1.2, 0.05, 0.7, M.deskTop, -106.4, 0.76, -27.5); sb.box(0.5, 0.33, 0.03, M.screenOff, -106.4, 1.0, -27.8);
  W.nodes.scada = new THREE.Vector3(-106, 2.1, -16.6);
  W.nodes.hmi = new THREE.Vector3(-112.5, 1.2, -23);
  W.nodes.agvsrv = new THREE.Vector3(-106.4, 1.1, -27.5);
  const ctrlSign = makeSign(['SALA DE CONTROL OT', 'SCADA · MES · HMI (Niveles 2-3)'], 4.8, { bg: '#0b3d2e', stripe: '#52b788' });
  ctrlSign.position.set(-112, 4.3, C.z1 + 0.05); root.add(ctrlSign);

  // ---------- Gabinetes PLC ----------
  const cab = (id, x, z, ry = 0) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const body = new THREE.Mesh(G.box, M.cabinet); body.scale.set(1.8, 2.1, 0.6); body.position.y = 1.15; g.add(body);
    const plinth = new THREE.Mesh(G.box, M.darkSteel); plinth.scale.set(1.8, 0.1, 0.6); plinth.position.y = 0.05; g.add(plinth);
    const seam = new THREE.Mesh(G.box, M.darkSteel); seam.scale.set(0.02, 2.0, 0.62); seam.position.y = 1.15; g.add(seam);
    const led = emissiveMat(0x22ff55, 2.5);
    const l = new THREE.Mesh(G.sphere, led); l.scale.setScalar(0.05); l.position.set(0.6, 1.95, 0.31); g.add(l);
    const tag = makeSign(['PLC · ' + ({ plc_press: 'PRENSAS', plc_biw: 'CARROCERÍA', plc_paint: 'PINTURA', plc_oven: 'HORNO', plc_asm: 'ENSAMBLE', plc_qc: 'CALIDAD' }[id])], 0.9, { w: 512, h: 128, bg: '#ffffff', fg: '#111', sizes: [60] });
    tag.position.set(-0.3, 1.85, 0.305); g.add(tag);
    const hmi = new THREE.Mesh(G.box, M.screenOff); hmi.scale.set(0.38, 0.26, 0.03); hmi.position.set(0.45, 1.5, 0.31); g.add(hmi);
    root.add(g);
    W.cabinets[id] = { g, led };
    W.nodes[id] = new THREE.Vector3(x, 2.25, z);
  };
  cab('plc_press', -70, -26.6);
  cab('plc_biw', -20, 0.3);
  cab('plc_paint', 30, 0.3);
  cab('plc_oven', 55, 0.3);
  cab('plc_asm', 82, 0.3);
  cab('plc_qc', 106, 0.3, 0);

  // ---------- AP inalámbrico y dispositivos de ataque (ocultos) ----------
  sb.box(0.35, 0.08, 0.35, M.robotWhite, 12, 6, 7.85);
  sb.box(0.02, 0.25, 0.02, M.robotWhite, 11.9, 6.15, 7.9); sb.box(0.02, 0.25, 0.02, M.robotWhite, 12.1, 6.15, 7.9);
  W.nodes.ap = new THREE.Vector3(12, 6, 7.9);
  W.rogue = attackDevice(root, 98, 26.6, 'DISPOSITIVO NO AUTORIZADO');
  W.nodes.rogue = new THREE.Vector3(98, 1.2, 26.6);
  W.contractor = attackDevice(root, -17.2, 1.0, 'LAPTOP DE CONTRATISTA');
  W.nodes.contractor = new THREE.Vector3(-17.2, 1.2, 1.0);

  // ---------- Letreros de zona (con estado dinámico) ----------
  const zs = (id, x, y, z, ry = 0, w = 6) => {
    const p = new CanvasPanel(1024, 300, w);
    p.mesh.position.set(x, y, z); p.mesh.rotation.y = ry;
    root.add(p.mesh);
    // cadenas
    sb.box(0.03, B.h - y - 0.9, 0.03, M.darkSteel, x - w * 0.42, (B.h + y) / 2 + 0.45, z);
    sb.box(0.03, B.h - y - 0.9, 0.03, M.darkSteel, x + w * 0.42, (B.h + y) / 2 + 0.45, z);
    W.zoneSigns[id] = p;
  };
  zs('press', -70, 7.5, -11.2);
  zs('biw', -20, 7.8, -1.0);
  zs('paint', 28, 8.2, -1.2);
  zs('oven', 55, 7.4, -1.0, 0, 5);
  zs('asm', 82, 7.4, -0.8);
  zs('qc', 106, 7.0, -0.8, 0, 5);
  zs('log', -40, 6.5, 9.0, 0, 5);
  // tableros KPI (doble cara)
  const kpi = new CanvasPanel(1024, 512, 5);
  W.screens.kpi = kpi;
  for (const x of [-90, 40]) {
    for (const ry of [-Math.PI / 2, Math.PI / 2]) {
      const m = new THREE.Mesh(kpi.mesh.geometry, kpi.mat);
      m.position.set(x + (ry > 0 ? 0.06 : -0.06), 6.2, (WALK.z0 + WALK.z1) / 2); m.rotation.y = ry;
      root.add(m);
    }
    sb.box(0.08, 2.7, 5.2, M.black, x, 6.2, (WALK.z0 + WALK.z1) / 2);
    sb.box(0.03, B.h - 7.6, 0.03, M.darkSteel, x, (B.h + 7.6) / 2, 1.2); sb.box(0.03, B.h - 7.6, 0.03, M.darkSteel, x, (B.h + 7.6) / 2, 5.8);
  }

  // ---------- Andon (torretas) por zona ----------
  const andonPos = {
    press: PRESS.xs.map((x) => [x + 2.4, -11.6]),
    biw: [0, 1, 2, 3, 4, 5, 6].map((i) => [slotX(i), -1.75]),
    paint: [8, 9, 10, 11, 12, 13].map((i) => [slotX(i), -1.2]),
    oven: [[51, -2.6], [57.5, -2.6]],
    asm: [16, 17, 18, 19, 20, 21].map((i) => [slotX(i) + 2, -2.2]),
    qc: [[103, -2.6], [109.5, -2.6]],
    log: [[-25, 8.6], [25, 8.6], [72, 8.6]],
  };
  for (const id in andonPos) {
    const mats = { g: emissiveMat(0x22ff44, 2), a: emissiveMat(0xffaa00, 0.1), r: emissiveMat(0xff2222, 0.1) };
    const ab = new Batcher();
    for (const [x, z] of andonPos[id]) {
      ab.cyl(0.03, 2.3, M.darkSteel, x, 1.15, z);
      ab.cyl(0.075, 0.14, mats.r, x, 2.62, z);
      ab.cyl(0.075, 0.14, mats.a, x, 2.47, z);
      ab.cyl(0.075, 0.14, mats.g, x, 2.32, z);
      ab.cyl(0.08, 0.04, M.black, x, 2.71, z);
    }
    ab.build(root);
    W.andons[id] = mats;
  }

  sb.build(root);
  return W;
}

let _redSign;
function makeRedSignMat() { return _redSign || (_redSign = new THREE.MeshBasicMaterial({ color: 0xc81d25 })); }

function roomShell(sb, R, o) {
  const h = 3.6, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, w = R.x1 - R.x0, d = R.z1 - R.z0;
  sb.box(w, 0.15, d, M.office, cx, h, cz); // techo
  sb.box(w, 0.02, d, M.deskTop, cx, 0.01, cz); // piso
  const wall = (len, x, z, along, glass, doorAt) => {
    const mat = glass ? M.glassWall : M.office;
    const parts = doorAt != null ? [[along === 'x' ? R.x0 : R.z0, doorAt - 0.9], [doorAt + 0.9, along === 'x' ? R.x1 : R.z1]] : [[along === 'x' ? R.x0 : R.z0, along === 'x' ? R.x1 : R.z1]];
    for (const [a, b] of parts) {
      const L = b - a, m = (a + b) / 2;
      if (along === 'x') { sb.box(L, h, 0.06, mat, m, h / 2, z); sb.box(L, 0.08, 0.1, M.darkSteel, m, h - 0.04, z); sb.box(L, 0.08, 0.1, M.darkSteel, m, 0.04, z); }
      else { sb.box(0.06, h, L, mat, x, h / 2, m); sb.box(0.1, 0.08, L, M.darkSteel, x, h - 0.04, m); sb.box(0.1, 0.08, L, M.darkSteel, x, 0.04, m); }
      if (glass) for (let t = a; t <= b + 0.01; t += 2) { if (along === 'x') sb.box(0.06, h, 0.1, M.darkSteel, t, h / 2, z); else sb.box(0.1, h, 0.06, M.darkSteel, x, h / 2, t); }
    }
  };
  wall(w, 0, R.z1, 'x', o.glassS, o.door === 'S' ? o.doorAt : null);
  if (o.glassN) wall(w, 0, R.z0, 'x', true, null); else wall(w, 0, R.z0, 'x', false, null);
  wall(d, R.x1, 0, 'z', o.glassE, o.door === 'E' ? o.doorAt : null);
  for (let x = R.x0 + 2; x < R.x1; x += 3) for (let z = R.z0 + 2; z < R.z1; z += 3) sb.box(1.1, 0.03, 0.5, M.lightPanel, x, h - 0.09, z);
}

function serverRack(sb, root, x, z, ry, W) {
  sb.box(0.8, 2.1, 1.0, M.serverRack, x, 1.05, z, ry);
  if (!W.leds) { W.leds = [emissiveMat(0x33ff66, 2), emissiveMat(0x33aaff, 2), emissiveMat(0xffaa00, 2)]; }
  const fx = Math.sin(ry) * 0.51, fz = Math.cos(ry) * 0.51;
  for (let i = 0; i < 14; i++) {
    const y = 0.3 + i * 0.13;
    sb.box(0.6, 0.08, 0.02, M.darkSteel, x + fx, y, z + fz, ry);
    sb.box(0.03, 0.03, 0.03, W.leds[i % 3], x + fx * 1.02 + Math.cos(ry) * 0.25, y, z + fz * 1.02 - Math.sin(ry) * 0.25, ry);
  }
}

function seatedOperator(root, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2;
  const add = (geo, mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.scale.set(sx, sy, sz); g.add(m); };
  add(G.box, M.pants, 0, 0.55, -0.15, 0.36, 0.14, 0.45);
  add(G.box, M.vestY, 0, 0.92, 0.05, 0.4, 0.55, 0.24);
  add(G.sphere, M.skin, 0, 1.33, 0.05, 0.12, 0.14, 0.12);
  add(G.box, M.pants, 0, 0.3, -0.36, 0.3, 0.5, 0.12);
  root.add(g);
}

function forklift(sb, x, z, r) {
  const c = Math.cos(r), s = Math.sin(r);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  let p = at(0, 0); sb.box(2.2, 1.0, 1.2, M.orange, p[0], 0.75, p[1], r);
  p = at(-0.5, 0); sb.box(1.0, 1.0, 1.1, M.black, p[0], 1.9, p[1], r);
  p = at(1.2, 0); sb.box(0.12, 3.2, 1.0, M.darkSteel, p[0], 1.6, p[1], r);
  p = at(1.8, 0.3); sb.box(1.1, 0.06, 0.12, M.darkSteel, p[0], 0.15, p[1], r);
  p = at(1.8, -0.3); sb.box(1.1, 0.06, 0.12, M.darkSteel, p[0], 0.15, p[1], r);
  for (const [dx, dz] of [[0.7, 0.6], [0.7, -0.6], [-0.7, 0.6], [-0.7, -0.6]]) { p = at(dx, dz); sb.cyl(0.3, 0.25, M.tire, p[0], 0.3, p[1], Math.PI / 2, r); }
}

function attackDevice(root, x, z, label) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const cart = new THREE.Mesh(G.box, M.darkSteel); cart.scale.set(0.8, 0.8, 0.5); cart.position.y = 0.4; g.add(cart);
  const lap = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: 0xff2030 })); lap.scale.set(0.38, 0.25, 0.02); lap.position.set(0, 0.95, -0.1); lap.rotation.x = -0.25; g.add(lap);
  const base = new THREE.Mesh(G.box, M.black); base.scale.set(0.38, 0.02, 0.26); base.position.set(0, 0.81, 0.05); g.add(base);
  const ant = new THREE.Mesh(G.cyl, M.black); ant.scale.set(0.01, 0.5, 0.01); ant.position.set(0.3, 1.05, 0); g.add(ant);
  const sign = makeSign([label], 1.4, { w: 768, h: 128, bg: '#b00020', sizes: [56] });
  sign.position.set(0, 1.45, 0); g.add(sign);
  const sign2 = sign.clone(); sign2.rotation.y = Math.PI; g.add(sign2);
  g.visible = false;
  root.add(g);
  return g;
}

function buildRacks(root) {
  const rows = [28.0, 29.3, 37.0, 38.3, 47.6];
  const x0 = -96, bay = 2.8, nb = 66, levels = [0.12, 2.0, 3.9, 5.8];
  const dummy = new THREE.Object3D();
  const count = { post: rows.length * (nb + 1) * 2, beam: rows.length * nb * 4 * 2, pal: rows.length * nb * 4 * 2 };
  const posts = new THREE.InstancedMesh(G.box, M.rackBlue, count.post);
  const beams = new THREE.InstancedMesh(G.box, M.rackOrange, count.beam);
  const pals = new THREE.InstancedMesh(G.box, M.pallet, count.pal);
  const cartons = new THREE.InstancedMesh(G.box, M.carton, count.pal);
  let ip = 0, ib = 0, ic = 0;
  const col = new THREE.Color();
  for (const z of rows) {
    for (let b = 0; b <= nb; b++) {
      for (const dz of [0, 1.1]) { dummy.position.set(x0 + b * bay, 3.8, z + dz); dummy.scale.set(0.1, 7.6, 0.1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(ip++, dummy.matrix); }
    }
    for (let b = 0; b < nb; b++) {
      const cx = x0 + b * bay + bay / 2;
      levels.forEach((y, li) => {
        if (li > 0) for (const dz of [0, 1.1]) { dummy.position.set(cx, y - 0.08, z + dz); dummy.scale.set(bay - 0.1, 0.12, 0.07); dummy.updateMatrix(); beams.setMatrixAt(ib++, dummy.matrix); }
        for (const dx of [-0.68, 0.68]) {
          if (Math.random() < 0.18) continue;
          dummy.position.set(cx + dx, y + 0.07, z + 0.55); dummy.scale.set(1.2, 0.14, 1.0); dummy.updateMatrix(); pals.setMatrixAt(ic, dummy.matrix);
          const h = rand(0.5, 1.5);
          dummy.position.set(cx + dx, y + 0.14 + h / 2, z + 0.55); dummy.scale.set(1.12, h, 0.96); dummy.updateMatrix(); cartons.setMatrixAt(ic, dummy.matrix);
          const k = Math.random();
          col.setHex(k < 0.6 ? 0xc49a64 : k < 0.75 ? 0x8fb3d9 : k < 0.88 ? 0xd9d9d9 : 0x5f7f5f);
          cartons.setColorAt(ic, col);
          ic++;
        }
      });
    }
  }
  posts.count = ip; beams.count = ib; pals.count = ic; cartons.count = ic;
  for (const m of [posts, beams, pals, cartons]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; root.add(m); }
  if (cartons.instanceColor) cartons.instanceColor.needsUpdate = true;
  cartons.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
}

// ---------- Dibujo de letreros de zona ----------
export function drawZoneSign(W, id) {
  const p = W.zoneSigns[id];
  if (!p) return;
  const z = S.zones[id] || { status: 'ok', note: '' };
  const ctx = p.ctx, w = p.w, h = p.h;
  const col = { ok: '#1f9d55', warn: '#e0a100', stop: '#d62828', attack: '#d62828' }[z.status];
  ctx.fillStyle = '#0f1f2e'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#16324d'; ctx.fillRect(0, 0, w, 175);
  ctx.fillStyle = '#fff'; ctx.font = `800 92px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ZONES[id].toUpperCase(), w / 2, 92);
  ctx.fillStyle = col; roundRect(ctx, 24, 190, w - 48, 92, 16); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `800 54px ${FONT}`;
  const label = { ok: 'OPERANDO', warn: 'ALERTA', stop: 'PARO', attack: 'INCIDENTE CIBER' }[z.status];
  ctx.fillText(label + (z.note ? ' · ' + z.note : ''), w / 2, 238, w - 70);
  p.update();
}

export function updateAndons(W, t) {
  for (const id in W.andons) {
    const z = S.zones[id] || { status: 'ok' };
    const m = W.andons[id];
    const blink = Math.sin(t * 10) > 0 ? 3 : 0.2;
    m.g.emissiveIntensity = z.status === 'ok' ? 2 : 0.08;
    m.a.emissiveIntensity = z.status === 'warn' ? blink : 0.08;
    m.r.emissiveIntensity = z.status === 'stop' ? 3 : z.status === 'attack' ? blink : 0.08;
  }
}
