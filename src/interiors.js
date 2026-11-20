import * as THREE from 'three';
import { ROOMS } from './config.js';
import { Batcher, G, M, CanvasPanel, makeCanvas, canvasTex, FONT, rand } from './util.js';

// Interiores realistas: consolas de sala de control, escritorios de oficina, sillas ergonómicas,
// monitores con bisel y racks de servidores con frente detallado y LEDs.
let MAT;
function mats() {
  if (MAT) return MAT;
  const std = (c, m = 0.1, r = 0.6, e = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, ...e });
  MAT = {
    consoleTop: std(0x30353c, 0.1, 0.45), consoleEdge: std(0x8a939c, 0.6, 0.35), consoleBody: std(0x22262b, 0.2, 0.6),
    deskTop: std(0xe9e6df, 0.0, 0.5), deskLeg: std(0x2a2d31, 0.7, 0.35), partition: std(0x7d8792, 0.0, 0.95), partitionTrim: std(0xb9c0c7, 0.6, 0.35),
    fabric: std(0x1c1f24, 0.0, 0.9), plastic: std(0x111316, 0.1, 0.45), chrome: std(0xd0d4d8, 1.0, 0.18),
    bezel: std(0x0d0f12, 0.3, 0.35), keyboard: std(0x16181b, 0.1, 0.55), keys: std(0x2b2f35, 0.0, 0.7),
    rackBody: std(0x14171b, 0.5, 0.45), raised: std(0x9aa1a8, 0.2, 0.6), wallPanel: std(0x1b2026, 0.2, 0.5), tower: std(0x1d2024, 0.4, 0.4),
  };
  return MAT;
}

// ---------- texturas de frente de rack ----------
function rackTexture(kind) {
  const W = 300, H = 1000;
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const e = makeCanvas(W, H), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  x.fillStyle = '#0d0f11'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1b1e22'; x.fillRect(0, 0, 18, H); x.fillRect(W - 18, 0, 18, H);
  x.fillStyle = '#050607';
  for (let y = 10; y < H; y += 8) { x.fillRect(6, y, 6, 4); x.fillRect(W - 12, y, 6, 4); }
  const U = 22.5;
  let y = 30;
  const led = (lx, ly, col, r = 2.2) => { x.fillStyle = col; x.beginPath(); x.arc(lx, ly, r, 0, 6.3); x.fill(); ex.fillStyle = col; ex.beginPath(); ex.arc(lx, ly, r + 0.8, 0, 6.3); ex.fill(); };
  const plan = kind === 'net'
    ? ['patch', 'switch', 'patch', 'switch', 'blank', 'fw', 'blank', 'srv1', 'srv1', 'srv2', 'blank', 'srv2', 'ups2', 'blank', 'srv1', 'srv1', 'blank', 'storage', 'blank', 'srv2']
    : kind === 'fw'
      ? ['patch', 'switch', 'fw', 'fw', 'blank', 'switch', 'blank', 'srv1', 'blank', 'blank', 'srv2', 'blank', 'ups2', 'blank']
      : ['switch', 'patch', 'blank', 'srv2', 'srv2', 'srv1', 'srv1', 'srv1', 'blank', 'storage', 'blank', 'srv2', 'srv2', 'blank', 'srv1', 'srv1', 'ups2', 'blank'];
  for (const it of plan) {
    const h = it === 'storage' ? 3 * U : /2$/.test(it) ? 2 * U : U;
    if (y + h > H - 30) break;
    const X0 = 22, X1 = W - 22;
    if (it === 'blank') { x.fillStyle = '#16181b'; x.fillRect(X0, y, X1 - X0, h - 1); }
    else if (it === 'switch' || it === 'patch') {
      x.fillStyle = it === 'switch' ? '#2a2f35' : '#1a1c1f'; x.fillRect(X0, y, X1 - X0, h - 1);
      for (let i = 0; i < 24; i++) {
        const px = X0 + 14 + i * 9.6, py = y + (i % 2 ? 12 : 4);
        x.fillStyle = '#050505'; x.fillRect(px, py, 7, 6);
        if (it === 'switch' && Math.random() < 0.8) led(px + 3.5, py - 1.5, Math.random() < 0.7 ? '#3bff6b' : '#ffb21e', 1.2);
        if (it === 'patch' && Math.random() < 0.85) { x.strokeStyle = ['#2f80ed', '#f2c94c', '#eb5757', '#27ae60', '#bbbbbb'][(i / 5) | 0]; x.lineWidth = 2.2; x.beginPath(); x.moveTo(px + 3.5, py + 6); x.quadraticCurveTo(px + 3.5 + rand(-6, 6), py + 30, X0 + 120 + rand(-60, 60), y + h + 20); x.stroke(); }
      }
    } else if (it === 'fw') {
      x.fillStyle = '#8f1d22'; x.fillRect(X0, y, X1 - X0, h - 1);
      x.fillStyle = '#3a0b0e'; for (let i = 0; i < 8; i++) x.fillRect(X0 + 90 + i * 15, y + 6, 10, 9);
      led(X0 + 14, y + 11, '#3bff6b'); led(X0 + 26, y + 11, '#3bff6b'); led(X0 + 38, y + 11, '#ffb21e');
      x.fillStyle = '#fff'; x.font = `700 9px ${FONT}`; x.fillText('NGFW', X0 + 48, y + 15);
    } else if (it === 'ups2') {
      x.fillStyle = '#25282c'; x.fillRect(X0, y, X1 - X0, h - 1);
      x.fillStyle = '#0a0f0a'; x.fillRect(X0 + 100, y + 10, 60, 22); led(X0 + 20, y + 22, '#3bff6b', 3);
      x.fillStyle = '#7cff9a'; x.font = `600 10px ${FONT}`; x.fillText('UPS 98%', X0 + 104, y + 25);
    } else {
      // servidores 1U/2U y almacenamiento: bahías de disco, rejillas y LEDs
      const g = x.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#5d646c'); g.addColorStop(1, '#3e444b');
      x.fillStyle = g; x.fillRect(X0, y, X1 - X0, h - 1);
      x.fillStyle = '#23272c'; x.fillRect(X0, y, 10, h - 1); x.fillRect(X1 - 10, y, 10, h - 1);
      const rows = it === 'storage' ? 3 : it === 'srv2' ? 2 : 1, bays = it === 'storage' ? 12 : 8;
      for (let r = 0; r < rows; r++) for (let b = 0; b < bays; b++) {
        const bx = X0 + 16 + b * ((X1 - X0 - 90) / bays), by = y + 3 + r * (U - 1), bw = (X1 - X0 - 90) / bays - 2, bh = U - 6;
        x.fillStyle = '#1e2226'; x.fillRect(bx, by, bw, bh);
        x.fillStyle = '#6e767f'; x.fillRect(bx + 2, by + bh / 2 - 1, bw - 4, 2);
        if (Math.random() < 0.9) led(bx + bw - 3, by + 3, Math.random() < 0.85 ? '#3bff6b' : '#3aa0ff', 1.1);
      }
      x.fillStyle = '#2c3137';
      for (let i = 0; i < 6; i++) x.fillRect(X1 - 70 + i * 8, y + 4, 4, h - 9);
      led(X1 - 16, y + 7, '#3aa0ff', 2); if (Math.random() < 0.3) led(X1 - 16, y + 14, '#ffb21e', 1.6);
    }
    y += h;
  }
  x.fillStyle = '#16181b'; x.fillRect(22, y, W - 44, H - 30 - y);
  const t = canvasTex(c), te = canvasTex(e);
  return { t, te };
}
const RACK = {};
function rackMats(kind, W) {
  if (RACK[kind]) return RACK[kind];
  const m = mats(), { t, te } = rackTexture(kind);
  const front = new THREE.MeshStandardMaterial({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.4 });
  (W.rackLeds = W.rackLeds || []).push(front);
  // 6 caras: +x, -x, +y, -y, +z (frente), -z
  RACK[kind] = [m.rackBody, m.rackBody, m.rackBody, m.rackBody, front, m.rackBody];
  return RACK[kind];
}
const RACK_GEO = new THREE.BoxGeometry(0.6, 2.0, 1.07);
export function addRack(root, W, x, z, ry, kind = 'srv') {
  const r = new THREE.Mesh(RACK_GEO, rackMats(kind, W));
  r.position.set(x, 1.0, z); r.rotation.y = ry;
  root.add(r);
  return r;
}

// ---------- mobiliario (se fusiona por material con el Batcher) ----------
export function chair(sb, x, y, z, ry) {
  const m = mats(), c = Math.cos(ry), s = Math.sin(ry);
  const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  for (let i = 0; i < 5; i++) {
    const a = ry + (i / 5) * Math.PI * 2;
    sb.add(G.box, m.plastic, x + Math.sin(a) * 0.17, y + 0.08, z + Math.cos(a) * 0.17, 0, a, 0, 0.05, 0.04, 0.34);
    sb.add(G.sphere, m.plastic, x + Math.sin(a) * 0.33, y + 0.03, z + Math.cos(a) * 0.33, 0, 0, 0, 0.03, 0.03, 0.03);
  }
  sb.cyl(0.025, 0.32, m.chrome, x, y + 0.26, z);
  let p = at(0, 0); sb.add(G.box, m.fabric, p[0], y + 0.46, p[1], 0, ry, 0, 0.5, 0.08, 0.48);
  p = at(0, -0.26); sb.add(G.box, m.fabric, p[0], y + 0.8, p[1], -0.12, ry, 0, 0.46, 0.56, 0.07);
  p = at(0, -0.3); sb.add(G.box, m.plastic, p[0], y + 0.58, p[1], 0, ry, 0, 0.06, 0.24, 0.04);
  for (const sx of [-0.27, 0.27]) {
    p = at(sx, 0.02); sb.add(G.box, m.plastic, p[0], y + 0.62, p[1], 0, ry, 0, 0.05, 0.03, 0.24);
    p = at(sx, -0.04); sb.add(G.box, m.plastic, p[0], y + 0.54, p[1], 0, ry, 0, 0.03, 0.16, 0.03);
  }
}
function keyboard(sb, x, y, z, ry) {
  const m = mats(), c = Math.cos(ry), s = Math.sin(ry);
  sb.add(G.box, m.keyboard, x, y + 0.012, z, 0.05, ry, 0, 0.44, 0.022, 0.15);
  sb.add(G.box, m.keys, x, y + 0.026, z, 0.05, ry, 0, 0.41, 0.006, 0.12);
  sb.add(G.box, m.keyboard, x + 0.31 * c, y + 0.015, z - 0.31 * s, 0, ry, 0, 0.065, 0.03, 0.1);
}
// monitor con bisel delgado, brazo y base; pantalla = plano con material de canvas
function monitor(sb, root, x, y, z, ry, screenMat, w = 0.6, h = 0.36) {
  const m = mats(), c = Math.cos(ry), s = Math.sin(ry);
  sb.add(G.box, m.bezel, x, y + h / 2 + 0.17, z, 0, ry, 0, w + 0.02, h + 0.02, 0.03);
  const bx = x - 0.03 * s, bz = z - 0.03 * c;
  sb.add(G.box, m.bezel, bx - 0.05 * s, y + 0.1, bz - 0.05 * c, 0, ry, 0, 0.05, 0.2, 0.04);
  sb.add(G.box, m.bezel, bx - 0.05 * s, y + 0.01, bz - 0.05 * c, 0, ry, 0, 0.24, 0.02, 0.18);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.01, h - 0.01), screenMat);
  sc.position.set(x + 0.016 * s, y + h / 2 + 0.17, z + 0.016 * c); sc.rotation.y = ry;
  root.add(sc);
}

// ---------- pantallas de oficina (correo, hoja de cálculo, código) ----------
function officeScreens() {
  const make = (draw) => { const p = new CanvasPanel(512, 300, 0.6); draw(p.ctx, 512, 300); p.update(); return p.mat; };
  const bar = (x, t, col = '#1f6feb') => { x.fillStyle = col; x.fillRect(0, 0, 512, 26); x.fillStyle = '#fff'; x.font = `600 14px ${FONT}`; x.fillText(t, 10, 18); };
  return [
    make((x) => { x.fillStyle = '#f5f7fa'; x.fillRect(0, 0, 512, 300); bar(x, 'Hoja de cálculo · Inventario', '#1e7e45'); x.strokeStyle = '#cfd6dd'; for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(0, 30 + i * 19); x.lineTo(512, 30 + i * 19); x.stroke(); } for (let j = 0; j < 7; j++) { x.beginPath(); x.moveTo(j * 74, 26); x.lineTo(j * 74, 300); x.stroke(); } x.fillStyle = '#444'; x.font = `12px ${FONT}`; for (let i = 0; i < 13; i++) for (let j = 0; j < 6; j++) x.fillText(String((Math.random() * 9000) | 0), j * 74 + 6, 44 + i * 19); }),
    make((x) => { x.fillStyle = '#1e1e1e'; x.fillRect(0, 0, 512, 300); bar(x, 'Editor · ansible/playbook.yml', '#333'); const cols = ['#9cdcfe', '#ce9178', '#569cd6', '#6a9955', '#dcdcaa']; x.font = `12px monospace`; for (let i = 0; i < 16; i++) { x.fillStyle = cols[i % 5]; x.fillText(' '.repeat((i % 4) * 2) + ['- name: actualizar', 'hosts: plc_gw', 'tasks:', '# respaldo diario', 'become: true'][i % 5], 10, 44 + i * 16); } }),
    make((x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 300); bar(x, 'Correo corporativo'); x.fillStyle = '#e9eef5'; x.fillRect(0, 26, 150, 274); for (let i = 0; i < 9; i++) { x.fillStyle = i === 1 ? '#fff4d6' : '#fff'; x.fillRect(152, 30 + i * 30, 360, 28); x.fillStyle = '#222'; x.font = `600 12px ${FONT}`; x.fillText(['Compras', 'Proveedor', 'TI', 'RR.HH.', 'Calidad', 'Logística', 'Dirección', 'Seguridad', 'Finanzas'][i], 160, 48 + i * 30); } }),
    make((x) => { x.fillStyle = '#0b1220'; x.fillRect(0, 0, 512, 300); bar(x, 'Monitoreo de servidores', '#334155'); for (let k = 0; k < 4; k++) { x.strokeStyle = ['#38bdf8', '#22c55e', '#f59e0b', '#a78bfa'][k]; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < 50; i++) x.lineTo(10 + i * 10, 80 + k * 55 - Math.random() * 30); x.stroke(); } }),
  ];
}

// ================= SALA DE CONTROL =================
export function buildControlRoom(root, W, vw, people) {
  const m = mats(), sb = new Batcher(), C = ROOMS.control;
  // muro de video: marco, parteluces y repisa
  sb.box(0.12, 3.1, 15.6, m.wallPanel, C.x0 + 0.12, 1.95, -23);
  for (const z of [-30.7, -26.2, -25.35, -20.65, -19.8, -15.3]) sb.box(0.16, 2.9, 0.06, m.bezel, C.x0 + 0.2, 1.95, z);
  sb.box(0.5, 0.75, 15.4, m.consoleBody, C.x0 + 0.45, 0.38, -23);
  sb.box(0.56, 0.04, 15.4, m.consoleTop, C.x0 + 0.45, 0.77, -23);
  // tarima del segundo nivel
  sb.box(4.3, 0.2, 15.4, m.raised, -108.65, 0.1, -23);
  sb.box(0.06, 0.05, 15.4, M.yellow, -110.8, 0.205, -23);
  const rows = [{ xf: -113.0, y: 0 }, { xf: -109.6, y: 0.2 }];
  const zs = [-27.3, -24.65, -22.0, -19.35];
  const scr = vw.center.mat, scr2 = vw.left.mat, scr3 = vw.right.mat;
  rows.forEach((r, ri) => {
    const y0 = r.y, xd = r.xf - 0.45;
    // cubierta continua con canto metálico y faldón frontal
    sb.box(0.95, 0.05, 10.8, m.consoleTop, xd, y0 + 0.74, -23.3);
    sb.box(0.04, 0.05, 10.8, m.consoleEdge, r.xf + 0.02, y0 + 0.74, -23.3);
    sb.box(0.85, 0.66, 10.8, m.consoleBody, xd - 0.05, y0 + 0.36, -23.3);
    sb.box(0.06, 0.55, 10.8, m.consoleEdge, r.xf - 0.12, y0 + 0.36, -23.3);
    sb.box(0.12, 0.1, 10.8, m.bezel, xd - 0.4, y0 + 0.8, -23.3);
    zs.forEach((z, k) => {
      // 3 monitores (lateral en ángulo) + teclado, mouse, teléfono
      const mx = r.xf - 0.62, my = y0 + 0.765;
      monitor(sb, root, mx, my, z, Math.PI / 2, (k + ri) % 3 === 0 ? scr2 : scr);
      monitor(sb, root, mx + 0.13, my, z - 0.63, Math.PI / 2 - 0.38, scr);
      monitor(sb, root, mx + 0.13, my, z + 0.63, Math.PI / 2 + 0.38, (k + ri) % 2 ? scr3 : scr2);
      keyboard(sb, r.xf - 0.27, y0 + 0.765, z, Math.PI / 2);
      sb.box(0.16, 0.05, 0.2, m.plastic, r.xf - 0.3, y0 + 0.79, z + 0.55);
      chair(sb, r.xf + 0.62, y0, z, -Math.PI / 2);
    });
  });
  // operadores sentados (con diadema) y supervisor de pie
  people.push({ x: -113.0 + 0.62, y: 0, z: -24.65, yaw: -Math.PI / 2, outfit: 'operator', seated: true, headset: true });
  people.push({ x: -109.6 + 0.62, y: 0.2, z: -22.0, yaw: -Math.PI / 2, outfit: 'operator', seated: true, headset: true });
  people.push({ x: -107.4, y: 0.2, z: -18.6, yaw: -Math.PI / 2 - 0.4, outfit: 'office', seated: false });
  // racks SCADA/MES y estación de ingeniería
  addRack(root, W, -105.75, -16.0, -Math.PI / 2, 'srv');
  addRack(root, W, -105.75, -16.62, -Math.PI / 2, 'net');
  addRack(root, W, -105.75, -17.24, -Math.PI / 2, 'srv');
  const ex = -106.2, ez = -27.5;
  sb.box(0.75, 0.04, 1.5, m.deskTop, ex, 0.74, ez);
  for (const dz of [-0.68, 0.68]) sb.box(0.7, 0.72, 0.05, m.deskLeg, ex, 0.36, ez + dz);
  const eng = officeScreens();
  monitor(sb, root, ex + 0.2, 0.76, ez - 0.3, -Math.PI / 2, eng[3]);
  monitor(sb, root, ex + 0.2, 0.76, ez + 0.32, -Math.PI / 2, eng[1]);
  keyboard(sb, ex - 0.12, 0.76, ez, -Math.PI / 2);
  sb.box(0.2, 0.45, 0.45, m.tower, ex + 0.1, 0.23, ez + 0.95);
  chair(sb, ex - 0.6, 0, ez, Math.PI / 2);
  sb.build(root);
}

// ================= OFICINAS TI =================
export function buildITOffice(root, W, laptopPanel, people) {
  const m = mats(), sb = new Batcher();
  const scr = officeScreens();
  const xs = [-116.2, -113.4, -110.6], zs = [-44.6, -40.4];
  let k = 0;
  for (const z of zs) for (const x of xs) {
    // escritorio: cubierta clara, patas metálicas, mampara de tela con perfil
    sb.box(1.5, 0.035, 0.78, m.deskTop, x, 0.74, z);
    for (const dx of [-0.7, 0.7]) { sb.box(0.05, 0.72, 0.65, m.deskLeg, x + dx, 0.36, z); sb.box(0.06, 0.03, 0.7, m.deskLeg, x + dx, 0.02, z); }
    sb.box(1.4, 0.35, 0.02, m.deskLeg, x, 0.55, z - 0.33);
    sb.box(1.56, 1.25, 0.05, m.partition, x, 0.625, z - 0.42);
    sb.box(1.58, 0.03, 0.07, m.partitionTrim, x, 1.26, z - 0.42);
    const isVictim = x === -110.6 && z === -40.4;
    if (!isVictim) {
      monitor(sb, root, x - 0.33, 0.757, z - 0.22, 0.12, scr[k % 4]);
      monitor(sb, root, x + 0.33, 0.757, z - 0.22, -0.12, scr[(k + 1) % 4]);
    } else {
      monitor(sb, root, x + 0.42, 0.757, z - 0.24, -0.2, scr[2]);
    }
    keyboard(sb, x, 0.757, z + 0.05, 0);
    sb.box(0.22, 0.03, 0.3, m.keys, x - 0.55, 0.77, z + 0.05, 0.3);
    chair(sb, x, 0, z + 0.62, Math.PI);
    k++;
  }
  // laptop de la víctima (pantalla con el correo de phishing)
  const lx = -110.6 - 0.12, lz = -40.4 - 0.05;
  sb.box(0.36, 0.018, 0.25, m.bezel, lx, 0.766, lz + 0.05);
  sb.box(0.37, 0.24, 0.012, m.bezel, lx, 0.89, lz - 0.08, 0, -0.25);
  laptopPanel.mesh.geometry = new THREE.PlaneGeometry(0.34, 0.215);
  laptopPanel.mesh.position.set(lx, 0.89, lz - 0.072); laptopPanel.mesh.rotation.set(-0.25, 0, 0);
  W.nodes.laptop.set(lx, 1.0, lz);
  // personal de oficina
  people.push({ x: -110.6, y: 0, z: -40.4 + 0.62, yaw: Math.PI, outfit: 'office', seated: true });
  people.push({ x: -116.2, y: 0, z: -44.6 + 0.62, yaw: Math.PI, outfit: 'office', seated: true });
  // racks del centro de datos corporativo
  for (let i = 0; i < 4; i++) addRack(root, W, -118.3, -47.9 + i * 0.62, Math.PI / 2, i === 1 ? 'net' : 'srv');
  sb.build(root);
}
export { mats as interiorMats };
