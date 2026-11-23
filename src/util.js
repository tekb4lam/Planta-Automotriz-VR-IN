import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// ---------- Static geometry batcher (merges by material => pocas draw calls) ----------
// depuración: ?dbgprims guarda las cajas de todas las primitivas estáticas para detectar objetos que se atraviesan
const DBG_PRIMS = typeof location !== 'undefined' && location.search.includes('dbgprims') ? (globalThis.__prims = []) : null;
export class Batcher {
  constructor() { this.map = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.clone();
    if (geo === G.box && g.attributes.uv) {
      // UV en metros: cada cara recibe las dimensiones reales de la caja (texturas sin estirar)
      const uv = g.attributes.uv, dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    }
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    if (DBG_PRIMS) { g.computeBoundingBox(); DBG_PRIMS.push({ b: g.boundingBox.clone(), mat: mat.name || mat.uuid.slice(0, 6), color: mat.color ? mat.color.getHexString() : '' }); }
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  box(w, h, d, mat, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(G.box, mat, x, y, z, rx, ry, rz, w, h, d); }
  cyl(r, h, mat, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(G.cyl, mat, x, y, z, rx, ry, rz, r, h, r); }
  build(parent) {
    const meshes = [];
    for (const [mat, list] of this.map) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

// Unit primitives (scaled by batcher)
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};

// Build a merged geometry (for reusable dynamic parts) from a list of [geo, x,y,z, rx,ry,rz, sx,sy,sz]
export function mergeParts(parts) {
  const list = parts.map(([geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const g = geo.clone();
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    return g;
  });
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}
// Merge parts with per-part vertex colors: list of [partArray, hex]
const _c = new THREE.Color();
export function mergeColored(list) {
  const geos = list.map(([[geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1], hex]) => {
    const g = geo.clone();
    _q.setFromEuler(_e.set(rx, ry, rz));
    _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    _c.setHex(hex).convertSRGBToLinear();
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}
// slab between two points in the XY plane (for pillars, glass…)
export function slab(x0, y0, x1, y1, t, w, z = 0) {
  const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
  return [G.box, (x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, a, L, t, w];
}
export const P = {
  box: (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => [G.box, x, y, z, rx, ry, rz, w, h, d],
  cyl: (r, h, x, y, z, rx = 0, ry = 0, rz = 0) => [G.cyl, x, y, z, rx, ry, rz, r, h, r],
  sph: (r, x, y, z, sx = 1, sy = 1, sz = 1) => [G.sphere, x, y, z, 0, 0, 0, r * sx, r * sy, r * sz],
};

// ---------- Canvas helpers ----------
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function canvasTex(canvas, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}
export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function warnIcon(ctx, x, y, s, color = '#ffcc00') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55); ctx.lineTo(x + s * 0.55, y + s * 0.45); ctx.lineTo(x - s * 0.55, y + s * 0.45);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = `900 ${s * 0.62}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + s * 0.1);
  ctx.restore();
}
export function wrapText(ctx, text, x, y, maxW, lineH, maxLines = 99) {
  const words = String(text).split(' ');
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lineH);
      n++; line = words[i];
      if (n >= maxLines) return n;
    } else line = test;
  }
  if (line) { ctx.fillText(line, x, y + n * lineH); n++; }
  return n;
}

// A plane mesh backed by a canvas that can be redrawn
export class CanvasPanel {
  constructor(pw, ph, worldW, opts = {}) {
    this.canvas = makeCanvas(pw, ph);
    this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTex(this.canvas);
    const worldH = worldW * ph / pw;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: !!opts.transparent, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, depthWrite: !opts.transparent, fog: opts.fog ?? true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), this.mat);
    this.w = pw; this.h = ph;
  }
  update() { this.tex.needsUpdate = true; }
}

// Simple text sign (static)
export function signTexture(lines, opts = {}) {
  const w = opts.w || 1024, h = opts.h || 256;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#14324f'; ctx.fillRect(0, 0, w, h);
  if (opts.stripe) { ctx.fillStyle = opts.stripe; ctx.fillRect(0, h - 18, w, 18); }
  ctx.fillStyle = opts.fg || '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sizes = opts.sizes || [h * 0.42, h * 0.2];
  const ys = lines.length === 1 ? [h / 2] : [h * 0.4, h * 0.76];
  // el texto se reduce hasta caber en el ancho (con margen) para que nunca se corte
  const maxW = w * 0.92;
  lines.forEach((t, i) => {
    let fs = sizes[i];
    ctx.font = `700 ${fs}px ${FONT}`;
    while (fs > 10 && ctx.measureText(t).width > maxW) { fs -= 2; ctx.font = `700 ${fs}px ${FONT}`; }
    ctx.fillText(t, w / 2, ys[i]);
  });
  return canvasTex(c);
}
export function makeSign(lines, worldW, opts = {}) {
  const tex = signTexture(lines, opts);
  const w = opts.w || 1024, h = opts.h || 256;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldW * h / w), mat);
}

// ---------- Procedural textures ----------
export function concreteTexture() {
  const s = 512, c = makeCanvas(s, s), ctx = c.getContext('2d');
  ctx.fillStyle = '#8d9196'; ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '60,60,60' : '170,170,170'},${rand(0.03, 0.08)})`;
    ctx.beginPath(); ctx.arc(rand(0, s), rand(0, s), rand(10, 70), 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, s - 2, s - 2);
  return canvasTex(c, 1, 1);
}
export function corrugatedTexture(base = '#b9c3cc') {
  const c = makeCanvas(256, 64), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 32, 0);
  g.addColorStop(0, base); g.addColorStop(0.5, '#e3e9ee'); g.addColorStop(1, base);
  for (let x = 0; x < 256; x += 32) { ctx.fillStyle = g; ctx.save(); ctx.translate(x, 0); ctx.fillRect(0, 0, 32, 64); ctx.restore(); }
  return canvasTex(c);
}
export function meshFenceTexture() {
  const c = makeCanvas(256, 256), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 12.8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.strokeStyle = '#f2c200'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, 256, 256);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function dotTexture() {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return canvasTex(c);
}
export function smokeTexture() {
  const c = makeCanvas(128, 128), ctx = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 64 + rand(-22, 22), y = 64 + rand(-22, 22), r = rand(20, 44);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  return canvasTex(c);
}
export function hazardTexture() {
  const c = makeCanvas(128, 32), ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c200'; ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#111';
  for (let x = -32; x < 160; x += 32) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 16, 32); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 0); ctx.fill(); }
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- Shared materials ----------
const std = (color, metalness = 0.2, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
export const M = {};
export function initMaterials() {
  Object.assign(M, {
    concrete: lam(0xffffff, { map: concreteTexture() }),
    wall: lam(0xffffff, { map: corrugatedTexture() }),
    roof: lam(0xb9c2cb, { emissive: 0x23282d }),
    steel: std(0x8a9299, 0.7, 0.45),
    darkSteel: std(0x3c434a, 0.6, 0.5),
    beam: lam(0x6f7d8a),
    column: std(0xd9b53b, 0.2, 0.6),
    yellow: std(0xf2c200, 0.1, 0.55),
    yellowPaint: lam(0xf2c200, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    greenFloor: lam(0x3f7a52, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    hazard: lam(0xffffff, { map: hazardTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    fence: lam(0xffffff, { map: meshFenceTexture(), transparent: false, alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide }),
    fencePost: std(0xf2c200, 0.2, 0.6),
    orange: std(0xff6a00, 0.25, 0.45),
    robotWhite: std(0xeeeeee, 0.1, 0.5),
    black: std(0x1a1c1f, 0.2, 0.7),
    rubber: std(0x111111, 0, 0.9),
    rim: std(0xc9cdd1, 0.9, 0.3),
    glass: new THREE.MeshStandardMaterial({ color: 0x0d1b26, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.6 }),
    glassWall: new THREE.MeshStandardMaterial({ color: 0x9fd3ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    pressBlue: std(0x2c4f73, 0.35, 0.5),
    pressDark: std(0x22272c, 0.5, 0.5),
    cabinet: std(0xc7ccd1, 0.3, 0.55),
    cabinetDark: std(0x2a3138, 0.3, 0.55),
    rackBlue: std(0x1f5fa8, 0.3, 0.5),
    rackOrange: std(0xe86a1c, 0.3, 0.5),
    pallet: lam(0xa07a4b),
    carton: lam(0xc49a64),
    binBlue: std(0x2266cc, 0.0, 0.7),
    desk: lam(0x4a4f55),
    deskTop: lam(0xd8d2c4),
    office: lam(0xe9ecef),
    screenOff: std(0x0a0c0f, 0.3, 0.3),
    lightPanel: new THREE.MeshBasicMaterial({ color: 0xfdfcf2 }),
    skylight: new THREE.MeshBasicMaterial({ color: 0xcfe6ff }),
    ovenPanel: std(0x8f969c, 0.5, 0.5),
    ovenGlow: new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
    booth: std(0xdfe5ea, 0.2, 0.6),
    vest: std(0xff8c1a, 0, 0.8),
    vestY: std(0xd9ff3a, 0, 0.8),
    pants: std(0x223a5e, 0, 0.9),
    skin: std(0xc68e6a, 0, 0.8),
    helmet: std(0xffffff, 0.1, 0.4),
    helmetY: std(0xffd21a, 0.1, 0.4),
    chair: lam(0x23272b),
    agv: std(0xf28c1a, 0.2, 0.5),
    green: lam(0x4caf50),
    coil: std(0xb8bfc6, 0.9, 0.3),
    sheet: std(0xc9d0d6, 0.95, 0.25),
    lift: std(0xf2c200, 0.2, 0.5),
    tire: std(0x161616, 0, 0.85),
    ext: std(0xd01818, 0.2, 0.5),
    serverRack: std(0x15181c, 0.4, 0.5),
    fw: std(0xb3121f, 0.3, 0.45),
    vc: std(0xffffff, 0.3, 0.5, { vertexColors: true }),
    plate: std(0x8a9299, 0.7, 0.45),
    vcMatte: std(0xffffff, 0.0, 0.85, { vertexColors: true }),
  });
}

export function emissiveMat(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
}
