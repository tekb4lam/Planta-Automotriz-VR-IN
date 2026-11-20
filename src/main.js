import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LOCATIONS, ZONES, PRESS, LINE, slotX } from './config.js';
import { initMaterials, M } from './util.js';
import { S, setZone, stopLine, lineRunning } from './state.js';
import { buildWorld, drawZoneSign, updateAndons } from './world.js';
import { Particles, Smoke, Markers, Beacons, Shields, Flashes } from './fx.js';
import { PressLine } from './press.js';
import { Line } from './line.js';
import { AGVFleet } from './agv.js';
import { Network } from './network.js';
import { Audio } from './audio.js';
import { ScenarioEngine, DEFS } from './scenarios.js';
import { HUD } from './hud.js';
import { Player } from './xr.js';
import { loadAssets, A, pbr } from './assets.js';
import { placeProps } from './props.js';
import { RealWorker, makePerson } from './people.js';

initMaterials();
(async () => {
S.simSpeed = 1; S.ovenTarget = 180; S.attackFx = {}; S.dosStutter = false;

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa7b2bb);
scene.fog = new THREE.Fog(0xa7b2bb, 80, 280);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 420);
// ---------- Modelos y texturas (carpeta ./assets) ----------
const loadingEl = document.getElementById('loading');
try {
  await loadAssets(renderer, (p) => { if (loadingEl) loadingEl.textContent = 'Cargando modelos 3D… ' + Math.round(p * 100) + '%'; });
} catch (e) { console.warn(e); }
if (loadingEl) loadingEl.textContent = 'Construyendo la planta…';
await new Promise((r) => setTimeout(r, 30));
if (A.env) { scene.environment = A.env; scene.environmentIntensity = 0.8; }
else {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
}
// materiales PBR (Poly Haven) donde existan
const swap = (key, name, tile, extra) => { const m = pbr(name, tile, extra); if (m) M[key] = m; };
swap('concrete', 'floor', 6, { color: new THREE.Color(1.55, 1.6, 1.65), metalness: 0.0, envMapIntensity: 0.6 });
if (A.tex.wall_col) M.wallPBR = pbr('wall', 3, { color: new THREE.Color(1.15, 1.2, 1.25), metalness: 0.6 });
swap('roof', 'roof', 3, { color: 0xb0b8c0, metalness: 0.5 });
swap('pressBlue', 'press', 2.5, { metalness: 0.4 });
swap('booth', 'panel', 2, { color: 0xffffff, metalness: 0.3 });
swap('ovenPanel', 'panel', 2, { color: 0xc8ccd0, metalness: 0.5 });
swap('plate', 'plate', 1.2, { metalness: 0.8 });
const hemi = new THREE.HemisphereLight(0xeef4ff, 0x575757, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(30, 60, 25); scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe9ff, 0.35); fill.position.set(-40, 30, -30); scene.add(fill);

// ---------- Mundo ----------
const W = buildWorld(scene);
placeProps(scene, W);
// personal de oficinas y sala de control
const staff = [];
if (A.worker) for (const p of W.people) {
  const role = p.outfit === 'operator' ? (p.seated ? 'sala' : 'supervisor') : 'oficina';
  const w = makePerson(scene, role, p.x, p.z, p.yaw, { outfit: p.outfit, seated: p.seated, headset: p.headset });
  w.root.position.y += p.y || 0;
  staff.push(w);
}
const audio = new Audio();
const fx = {
  sparks: new Particles(scene, 1600, { size: 0.05, gravity: -9.8, drag: 0.6 }),
  mist: new Particles(scene, 1400, { size: 0.3, gravity: -0.4, drag: 1.6 }),
  smoke: new Smoke(scene, 90), markers: new Markers(scene), shields: new Shields(scene), flashes: new Flashes(scene), audio,
  flash(p) { this.flashes.emit(p); },
};
const press = new PressLine(scene, fx, audio);
const line = new Line(scene, fx, audio);
const agv = new AGVFleet(scene, fx);
const net = new Network(scene, W.nodes, fx);
const beacons = new Beacons(scene, W.columns.filter((c) => c.z !== 25).map((c) => new THREE.Vector3(c.x, 10.4, c.z + 0.4)));

S.listeners.push((type, id) => { if (type === 'zone') drawZoneSign(W, id); });
Object.keys(ZONES).forEach((id) => { setZone(id, 'ok'); drawZoneSign(W, id); });

// ---------- Contexto de escenarios ----------
const SPECIAL = {
  press2: new THREE.Vector3(PRESS.xs[2], 0, PRESS.z + 3.2),
  biwcell: new THREE.Vector3(slotX(3), 0, LINE.z),
  ovenbox: new THREE.Vector3(55, 0, LINE.z),
};
const ctx = {
  W, line, press, agv, net, fx, audio,
  mark(key, text, color) {
    const p = SPECIAL[key] || W.nodes[key];
    if (!p) return;
    const room = p.x < -104;
    fx.markers.add(new THREE.Vector3(p.x, 0, p.z), text, color, { scale: key.startsWith('plc') ? 1.4 : room ? 0.7 : 1, short: room, labelY: room ? 2.75 : undefined });
  },
  compromise(id) {
    S.compromised.add(id);
    const cab = W.cabinets[id]; if (cab) cab.led.emissive.setHex(0xff1a1a);
    S.ui.dirty = true;
  },
  zone: setZone,
  stop: stopLine,
  alarm(on) { S.alarm = on; beacons.set(on); },
  laptop(mode) { hud.drawLaptop(mode); },
  robotsRogue() { line.robots.filter((r) => r.zone === 'biw').forEach((r) => (r.r.mode = 'rogue')); },
  toast(def, entry) { hud.showToast(def, entry); },
  fwFlash() { W.fwLed.emissive.setHex(0x33ff66); },
  resetAll,
};
const engine = new ScenarioEngine(ctx);

function resetAll() {
  engine.stop();
  S.stopReasons.clear(); S.alarm = false; beacons.set(false);
  press.reset(); line.reset(); agv.reset(); net.clear();
  fx.markers.clear(); fx.smoke.clear(); fx.sparks.clear(); fx.mist.clear();
  S.hmi = { encrypted: false, frozen: false, spoofOven: false, spoofBiw: false, frozenClock: null };
  S.attackFx = {}; S.ovenTarget = 180; S.dosStutter = false; S.pressStopped = false;
  S.kpi = { downtime: 0, pressDowntime: 0, produced: 0, defects: 0, safety: 0 };
  S.compromised.clear();
  Object.keys(ZONES).forEach((id) => setZone(id, 'ok'));
  for (const id in W.cabinets) W.cabinets[id].led.emissive.setHex(0x22ff55);
  W.rogue.visible = false; W.contractor.visible = false;
  hud.drawLaptop('normal'); hud.hideToast();
  S.ui.dirty = true;
}

line.onArrive = (b) => {
  if (S.attackFx.robots && b.slot >= 1 && b.slot <= 6 && !b.defect) {
    b.defect = 'Soldadura fuera de punto';
    b.marker = fx.markers.add(b.g.position, 'Soldadura defectuosa', '#ffb020', { follow: b.g, scale: 1.3, labelY: 3.3 });
  }
  if (S.attackFx.oven && (b.slot === 14 || b.slot === 15) && S.ovenTemp > 215 && !b.burnt) {
    b.burnt = true; b.defect = b.defect || 'Pintura quemada';
    if (b.marker) b.marker.dead = true;
    b.marker = fx.markers.add(b.g.position, 'Pintura quemada', '#ffb020', { follow: b.g, scale: 1.3, labelY: 3.3 });
  }
};

// ---------- HUD y jugador ----------
let locIdx = 0;
const actions = {
  engine,
  start: (id) => { audio.init(); engine.start(id); },
  startN: (n) => { const d = DEFS.find((x) => x.n === n); if (d) actions.start(d.id); },
  reset: () => { resetAll(); S.ui.tab = 'riesgos'; },
  go: (l) => { player.teleportTo(l.x, l.y, l.z, l.yaw, l.pitch || 0); },
  nextLocation: () => { locIdx = (locIdx + 1) % LOCATIONS.length; actions.go(LOCATIONS[locIdx]); },
  sound: () => { S.sound = !S.sound; audio.init(); audio.setEnabled(S.sound); },
  click: () => audio.click(),
  audioInit: () => audio.init(),
  affected: () => line.bodies.filter((b) => b.defect && b.slot < 22).length,
  robotStatus: () => { const r = line.robots.filter((r) => r.zone === 'biw'); return r.filter((x) => x.r.mode === 'normal').length + '/' + r.length + ' OK'; },
  agvStatus: () => agv.list.filter((a) => !a.hijack && !a.crashed).length + '/' + agv.list.length,
  toggleDom: () => { const d = document.getElementById('panel'); d.style.display = d.style.display === 'none' ? '' : 'none'; },
};
const hud = new HUD(scene, W, actions);
const player = new Player(renderer, scene, camera, hud, actions);
player.teleportTo(LOCATIONS[0].x, LOCATIONS[0].y, LOCATIONS[0].z, LOCATIONS[0].yaw);

// ---------- DOM (modo escritorio) ----------
const dom = document.getElementById('tablet');
hud.dom = dom;
const domPointer = (e, click) => {
  const r = dom.getBoundingClientRect();
  hud.pointer((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, click);
};
dom.addEventListener('pointermove', (e) => domPointer(e, false));
dom.addEventListener('pointerleave', () => { hud.hover = null; S.ui.dirty = true; });
dom.addEventListener('click', (e) => { audio.init(); domPointer(e, true); });
hud.drawTablet();

const vrBtn = document.getElementById('vr');
const note = document.getElementById('note');
async function setupVR() {
  let ok = false;
  try { ok = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { ok = false; }
  if (!ok) {
    vrBtn.textContent = 'VR no disponible aquí';
    vrBtn.disabled = true;
    note.textContent = 'Para VR abre este archivo desde una URL HTTPS en el navegador del Meta Quest 3. Aquí puedes explorar en modo escritorio.';
    return;
  }
  vrBtn.textContent = 'Entrar a VR';
  vrBtn.onclick = async () => {
    audio.init();
    const cur = renderer.xr.getSession();
    if (cur) { cur.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      const head = camera.getWorldPosition(new THREE.Vector3());
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Salir de VR';
      player.dolly.position.set(head.x, player.dolly.position.y, head.z);
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar a VR'; });
      try { session.updateTargetFrameRate?.(72); } catch (e) { /* opcional */ }
    } catch (e) { note.textContent = 'No se pudo iniciar la sesión VR: ' + e.message; }
  };
}
setupVR();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Bucle principal ----------
const clock = new THREE.Clock();
const hemiBase = new THREE.Color(0xeef4ff), hemiAlarm = new THREE.Color(0xffb0a8);
function tick(dt) {
  const sdt = dt * S.simSpeed;
  S.t += sdt;
  player.update(dt);
  engine.update(sdt);
  if (!lineRunning()) S.kpi.downtime += sdt;
  press.update(sdt);
  line.update(sdt, S.t);
  agv.update(sdt, S.t);
  net.update(sdt);
  fx.sparks.update(dt); fx.mist.update(dt); fx.smoke.update(dt); fx.markers.update(dt); fx.shields.update(dt); fx.flashes.update(dt);
  beacons.update(dt);
  updateAndons(W, S.t);
  for (const w of staff) w.update(dt, S.t, S.alarm ? 'alarm' : w.seated ? 'work' : 'idle');
  if (W.rackLeds) W.rackLeds.forEach((m, i) => (m.emissiveIntensity = 1.2 + 0.6 * Math.sin(S.t * (4 + i * 1.7) + i) + (Math.random() < 0.05 ? 0.8 : 0)));
  // LEDs de servidores parpadeando
  if (W.leds) W.leds.forEach((m, i) => (m.emissiveIntensity = Math.sin(S.t * (7 + i * 3) + i) > 0 ? 2.2 : 0.4));
  hud.update(dt);
  hud.updateToast(dt, camera);
  audio.update(S.t);
  const a = S.alarm ? 0.35 + 0.25 * Math.sin(S.t * 6) : 0;
  hemi.color.copy(hemiBase).lerp(hemiAlarm, a);
}
renderer.setAnimationLoop(() => {
  tick(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
});
const advance = (sec) => { for (let t = 0; t < sec; t += 0.05) tick(0.05); return S.t; };
window.__sim = { A, advance, S, engine, actions, player, line, agv, press, renderer, scene, camera, hud, LOCATIONS };
document.getElementById('loading')?.remove();
})();
