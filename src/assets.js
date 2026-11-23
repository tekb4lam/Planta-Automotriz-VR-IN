import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Recursos externos (carpeta ./assets junto a index.html). Si algo falla, la planta usa los modelos procedurales.
export const A = { ok: false, tex: {} };
const BASE = './assets/';
const MODELS = {
  kr210: 'kr210.glb', irb5400: 'irb5400.glb', carHi: 'car_hi.glb', carLo: 'car_lo.glb', worker: 'worker.glb',
  shelves: 'steel_frame_shelves_01.glb', toolCart: 'tool_cart.glb', box: 'cardboard_box_01.glb', barrel: 'barrel_01.glb',
  wetSign: 'wetfloorsign_01.glb', cam: 'security_camera_01.glb', ubox: 'utility_box_01.glb', weldCart: 'portable_welding_cart.glb',
};
// Personajes por rol (Meshy AI u otro rig Mixamo). Si un archivo no existe se usa el personaje de respaldo.
// Un rol puede tener varias variantes (se reparten en orden entre las personas de ese rol).
export const ROLE_FILES = {
  linea: ['rol_linea.glb'], mantenimiento: ['rol_mantenimiento.glb'], calidad: ['rol_calidad.glb'],
  sala: ['rol_sala_control_1.glb', 'rol_sala_control_2.glb', 'rol_sala_control.glb'], oficina: ['rol_oficina.glb'], supervisor: ['rol_supervisor.glb'],
};
// Si falta un rol se usa otro (p. ej. sin rol_linea.glb los operarios de línea usan a Paco de mantenimiento).
const ROLE_FALLBACK = { linea: 'mantenimiento', mantenimiento: 'linea', supervisor: 'calidad', oficina: 'supervisor' };
// Equipos generados con Meshy AI (malla única texturizada). Si falta alguno se usa la versión procedural.
const MACHINES = { agv: 'agv.glb', montacargas: 'montacargas.glb', rack: 'rack_servidores.glb', tablero: 'tablero_plc.glb' };
const TEX = ['floor', 'wall', 'roof', 'press', 'plate', 'panel'];

export async function loadAssets(renderer, onProgress) {
  const mgr = new THREE.LoadingManager();
  mgr.onProgress = (_, l, t) => onProgress?.(l / Math.max(t, 1));
  const gl = new GLTFLoader(mgr).setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader(mgr);
  const jobs = [];
  for (const [k, f] of Object.entries(MODELS)) jobs.push(gl.loadAsync(BASE + 'models/' + f).then((g) => (A[k] = g)).catch((e) => console.warn('No se pudo cargar', f, e)));
  for (const n of TEX) for (const s of ['col', 'nor', 'arm']) {
    jobs.push(tl.loadAsync(`${BASE}textures/${n}_${s}.webp`).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
      if (s === 'col') t.colorSpace = THREE.SRGBColorSpace;
      A.tex[n + '_' + s] = t;
    }).catch(() => {}));
  }
  A.roles = {}; A.roleVariants = {}; A.mach = {};
  const variants = {};
  for (const [role, files] of Object.entries(ROLE_FILES)) {
    variants[role] = [];
    files.forEach((f, i) => jobs.push(gl.loadAsync(BASE + 'models/' + f).then((g) => (variants[role][i] = g)).catch(() => {})));
  }
  for (const [k, f] of Object.entries(MACHINES)) jobs.push(gl.loadAsync(BASE + 'models/' + f).then((g) => (A.mach[k] = prepMachine(g.scene))).catch(() => {}));
  for (const j of ['robot_paths', 'kr210', 'irb5400']) jobs.push(fetch(BASE + 'models/' + j + '.json').then((r) => r.json()).then((d) => (A[j + 'Info'] = d)).catch(() => {}));
  jobs.push(new RGBELoader(mgr).loadAsync(BASE + 'textures/env.hdr').then((h) => {
    const pm = new THREE.PMREMGenerator(renderer);
    A.env = pm.fromEquirectangular(h).texture; h.dispose(); pm.dispose();
  }).catch(() => {}));
  await Promise.all(jobs);
  for (const [r, v] of Object.entries(variants)) { const ok = v.filter(Boolean); if (ok.length) { A.roles[r] = ok[0]; A.roleVariants[r] = ok; } }
  for (const [r, fb] of Object.entries(ROLE_FALLBACK)) if (!A.roles[r] && A.roles[fb]) { A.roles[r] = A.roles[fb]; A.roleVariants[r] = A.roleVariants[fb]; }
  A.ok = !!(A.kr210 && A.irb5400 && A.carHi && A.robot_pathsInfo && A.kr210Info);
  if (A.carHi) A.car = { hi: buildCarParts(A.carHi.scene), lo: A.carLo ? buildCarParts(A.carLo.scene) : null };
  return A;
}

// ---------------- Equipos Meshy: normaliza materiales y entrega clones escalados ----------------
function prepMachine(scene) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.metalness = Math.min(m.metalness ?? 0, 0.2); m.roughness = Math.max(m.roughness ?? 1, 0.72);
    m.side = THREE.DoubleSide;
    if (m.map) { m.map.anisotropy = 4; m.map.colorSpace = THREE.SRGBColorSpace; }
  });
  return { scene, box: new THREE.Box3().setFromObject(scene) };
}
// machine('prensa', { height }) o { length } o { dims: [x, y, z] } (escala no uniforme).
// Devuelve un Group con la base en y=0 y centrado en x/z; userData.toW(mx,my,mz) convierte coords del modelo.
export function machine(k, o = {}) {
  const R = A.mach && A.mach[k];
  if (!R) return null;
  const size = R.box.getSize(new THREE.Vector3()), c = R.box.getCenter(new THREE.Vector3());
  let sx, sy, sz;
  if (o.dims) { sx = o.dims[0] / size.x; sy = o.dims[1] / size.y; sz = o.dims[2] / size.z; }
  else { const s = o.height ? o.height / size.y : o.length ? o.length / size.x : 1; sx = sy = sz = s; }
  const inner = R.scene.clone(true);
  inner.scale.set(sx, sy, sz);
  inner.position.set(-c.x * sx, -R.box.min.y * sy, -c.z * sz);
  const g = new THREE.Group(); g.add(inner);
  g.userData.size = new THREE.Vector3(size.x * sx, size.y * sy, size.z * sz);
  g.userData.toW = (mx, my, mz) => new THREE.Vector3((mx - c.x) * sx, (my - R.box.min.y) * sy, (mz - c.z) * sz);
  return g;
}

// Material PBR con texturas de Poly Haven (UV en metros: repeat = 1/tamaño de mosaico)
export function pbr(name, tile = 2, extra = {}) {
  const c = A.tex[name + '_col'];
  if (!c) return null;
  const clone = (t) => { if (!t) return null; const x = t.clone(); x.repeat.set(1 / tile, 1 / tile); x.needsUpdate = true; return x; };
  const arm = clone(A.tex[name + '_arm']);
  const m = new THREE.MeshStandardMaterial({ map: clone(c), normalMap: clone(A.tex[name + '_nor']), roughnessMap: arm, metalnessMap: arm, roughness: 1, metalness: 1, ...extra });
  m.userData.tile = tile;
  return m;
}

// ---------------- Auto: separa piezas por etapa de manufactura ----------------
const CAT = (name, mat) => {
  const m = (mat || '').toLowerCase(), n = name || '';
  if (m === 'glass') return 'glass';
  if (/headlight|brakelight|signallight/.test(m)) return 'lights';
  if (/tireside|tiretread/.test(m)) return 'tires';
  if (/rim|brake|disc/.test(m)) return 'rims';
  if (/Underside|InteriorFloor/.test(n)) return 'floor';
  if (/Axles/.test(n) || m === 'mechanical') return 'chassis';
  if (/^Interior/.test(n) || /interior|hardware|floormat|dashboard/.test(m)) return 'interior';
  if (/paint/.test(m)) {
    if (/Roof|Pillars/.test(n)) return 'roof';
    if (/Door|Hood|Mirror|Handle|Hatch/.test(n)) return 'closures';
    return 'sides';
  }
  return 'trim';
};
function buildCarParts(scene) {
  scene.updateMatrixWorld(true);
  const lists = {};
  let headZ = 0, nH = 0;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const c = CAT(o.name, o.material && o.material.name);
    let g = new THREE.BufferGeometry();
    // atributos cuantizados (meshopt) -> Float32 antes de transformar
    for (const k of ['position', 'normal']) {
      const a = o.geometry.attributes[k]; if (!a) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    g = g.index ? g : g;
    (lists[c] = lists[c] || []).push(g);
    if (c === 'lights' && /head/i.test(o.material.name)) { const b = new THREE.Box3().setFromBufferAttribute(g.attributes.position); headZ += (b.min.z + b.max.z) / 2; nH++; }
  });
  const parts = {};
  for (const c in lists) {
    const ok = lists[c].filter((g) => g.index);
    const non = lists[c].filter((g) => !g.index).map((g) => g.toNonIndexed());
    let merged = null;
    try { merged = mergeGeometries(ok.length ? ok : non, false); } catch (e) { merged = null; }
    if (merged) parts[c] = merged;
  }
  // orienta: frente (+z original) hacia +x de la línea; origen = centro inferior
  const front = nH && headZ / nH < 0 ? -1 : 1;
  const rot = new THREE.Matrix4().makeRotationY(front > 0 ? Math.PI / 2 : -Math.PI / 2);
  const box = new THREE.Box3();
  for (const c in parts) { parts[c].applyMatrix4(rot); parts[c].computeBoundingBox(); box.union(parts[c].boundingBox); }
  const off = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  for (const c in parts) { parts[c].applyMatrix4(off); parts[c].computeBoundingSphere(); }
  parts._size = box.getSize(new THREE.Vector3());
  // geometrías de pintura acumuladas por etapa
  const order = [['floor', -1], ['sides', 2], ['roof', 3], ['closures', 6]];
  parts._paint = {};
  for (let k = 1; k <= order.length; k++) {
    const gs = order.slice(0, k).map(([c]) => parts[c]).filter(Boolean);
    parts._paint[k] = gs.length ? mergeGeometries(gs, false) : null;
  }
  parts._paintKey = (s) => order.filter(([, m]) => s >= m).length;
  return parts;
}
