import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { A } from './assets.js';
import { P, mergeColored, rand } from './util.js';

// Personas con esqueleto y animaciones reales (personaje Mixamo).
// La ropa se "pinta" en el shader a partir de la pose de reposo: overol con cintas reflejantes,
// camisa/pantalón de oficina, piel, guantes y calzado de seguridad, con bordes nítidos.
export const OUTFITS = {
  // overol azul marino con cintas reflejantes (operario de línea)
  coverall: { top: 0x1f2f4d, bottom: 0x1f2f4d, belt: 0x111418, hands: 0x2d2f33, feet: 0x15161a, stripe: 0xd8dde0, stripes: 1, skin: 0xc58c66, hair: 0x2a1d14, collar: 0x1a2740 },
  // overol gris de mantenimiento con cintas naranjas
  maint: { top: 0x5b6470, bottom: 0x5b6470, belt: 0x1a1a1a, hands: 0x8a6a2a, feet: 0x2a1f16, stripe: 0xff8a1e, stripes: 1, skin: 0xa8734f, hair: 0x111111, collar: 0x4a525c },
  // operador de sala de control: polo azul y pantalón caqui
  operator: { top: 0x2b4c7e, bottom: 0x4b4a43, belt: 0x241c14, hands: 0xc99772, feet: 0x1b1612, stripe: 0x2b4c7e, stripes: 0, skin: 0xc99772, hair: 0x2b1b10, collar: 0x223f6b },
  // personal de oficina/TI: camisa clara y pantalón gris oscuro
  office: { top: 0xdfe8f3, bottom: 0x2e3238, belt: 0x161616, hands: 0xb98463, feet: 0x121212, stripe: 0xdfe8f3, stripes: 0, skin: 0xb98463, hair: 0x15100c, collar: 0xc9d6e6 },
};
const REGION = (n) => (/Head|Neck/.test(n) ? 1 : /Hand/.test(n) ? 2 : /Foot|Toe/.test(n) ? 3 : /Arm/.test(n) ? 4 : 0);

let prepared = false, FIG = null;
function prepare() {
  if (prepared) return;
  prepared = true;
  const sc = A.worker.scene;
  sc.updateMatrixWorld(true);
  let y0 = Infinity, y1 = -Infinity, x1 = 0;
  const meshes = [];
  sc.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const o of meshes) {
    const g = o.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const reg = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
      reg[i] = REGION(o.skeleton.bones[best].name);
    }
    g.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
    const m = o.matrix.elements;
    o.userData.sy = m[5]; o.userData.ty = m[13]; o.userData.sx = m[0]; o.userData.tx = m[12];
    g.computeBoundingBox();
    const b = g.boundingBox;
    y0 = Math.min(y0, b.min.y * m[5] + m[13]); y1 = Math.max(y1, b.max.y * m[5] + m[13]);
    x1 = Math.max(x1, Math.abs(b.max.x * m[0] + m[12]), Math.abs(b.min.x * m[0] + m[12]));
  }
  FIG = { y0, y1, x1 };
}

const MATS = {};
function outfitMat(name, ud) {
  const key = name + '_' + ud.sy.toFixed(5) + '_' + ud.ty.toFixed(4);
  if (MATS[key]) return MATS[key];
  const o = OUTFITS[name] || OUTFITS.coverall;
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.0 });
  const C = (h) => new THREE.Color(h);
  const u = {
    uTop: { value: C(o.top) }, uBottom: { value: C(o.bottom) }, uBelt: { value: C(o.belt) }, uHands: { value: C(o.hands) }, uFeet: { value: C(o.feet) },
    uStripe: { value: C(o.stripe) }, uSkin: { value: C(o.skin) }, uHair: { value: C(o.hair) }, uCollar: { value: C(o.collar) }, uStripes: { value: o.stripes },
    uSY: { value: ud.sy }, uTY: { value: ud.ty }, uSX: { value: ud.sx }, uTX: { value: ud.tx }, uFig: { value: new THREE.Vector3(FIG.y0, FIG.y1, FIG.x1) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nflat varying float vRegion;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
flat varying float vRegion; varying vec3 vBind;
uniform vec3 uTop, uBottom, uBelt, uHands, uFeet, uStripe, uSkin, uHair, uCollar; uniform float uStripes, uSY, uTY, uSX, uTX; uniform vec3 uFig;
float band(float v, float a, float b) { return step(a, v) * step(v, b); }
float stv = 0.0;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
float h = ((vBind.y * uSY + uTY) - uFig.x) / (uFig.y - uFig.x);
float ax = abs(vBind.x * uSX + uTX) / uFig.z;
vec3 col = h < 0.53 ? uBottom : uTop;
col = mix(col, uBelt, band(h, 0.545, 0.562));
col = mix(col, uCollar, band(h, 0.825, 0.86));
stv = uStripes * max(max(band(h, 0.13, 0.155), band(h, 0.19, 0.215)), band(h, 0.70, 0.725));
if (vRegion > 3.5) { stv = uStripes * max(band(ax, 0.47, 0.51), band(ax, 0.55, 0.59)); col = uTop; }
col = mix(col, uStripe, stv);
if (vRegion > 0.5 && vRegion < 1.5) col = h > 0.955 ? uHair : uSkin;
if (vRegion > 1.5 && vRegion < 2.5) { col = uHands; stv = 0.0; }
if (vRegion > 2.5 && vRegion < 3.5) { col = uFeet; stv = 0.0; }
vec4 diffuseColor = vec4( col, opacity );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (stv > 0.5) roughnessFactor = 0.35;');
  };
  m.customProgramCacheKey = () => 'outfit_' + key;
  MATS[key] = m;
  return m;
}

const GEAR = {};
function gear(vest, helmet) {
  const k = vest + '_' + helmet;
  if (GEAR[k]) return GEAR[k];
  const refl = 0xd9d9d9;
  const cyl = P.cyl(1, 1, 0, 0, 0)[0];
  GEAR[k] = {
    helmet: helmet == null ? null : mergeColored([[P.sph(0.135, 0, 0.115, 0.01, 1.0, 0.7, 1.12), helmet], [P.cyl(0.155, 0.015, 0, 0.105, 0.04), helmet], [P.box(0.16, 0.02, 0.07, 0, 0.105, 0.15), helmet]]),
    vest: vest == null ? null : mergeColored([
      [[cyl, 0, -0.09, 0.02, 0, 0, 0, 0.215, 0.5, 0.16], vest],
      [[cyl, 0, -0.22, 0.02, 0, 0, 0, 0.218, 0.045, 0.163], refl], [[cyl, 0, -0.06, 0.02, 0, 0, 0, 0.218, 0.045, 0.163], refl],
    ]),
    headset: mergeColored([[P.box(0.03, 0.07, 0.07, 0.1, 0.07, 0), 0x111111], [P.box(0.03, 0.07, 0.07, -0.1, 0.07, 0), 0x111111], [P.box(0.21, 0.02, 0.03, 0, 0.18, 0), 0x222222], [P.box(0.012, 0.012, 0.12, 0.09, 0.03, 0.07), 0x222222]]),
  };
  return GEAR[k];
}
let GM;
const gearMat = () => GM || (GM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
const _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// Rotaciones aditivas de la pose sentada (calibradas con el esqueleto Mixamo)
export const SEAT = { ul: [-1.45, 0, 0], l: [1.45, 0, 0], a: [0, 0.4, 0.1], f: [0, 1.15, 0], drop: 0.44 };

export class RealWorker {
  // opts: { outfit, seated, headset }; vest/helmet = null para omitirlos
  constructor(scene, x, z, yaw, vest = 0xff8c1a, helmet = 0xffffff, opts = {}) {
    prepare();
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.yaw = yaw;
    this.seated = !!opts.seated;
    const m = skClone(A.worker.scene);
    const outfit = opts.outfit || 'coverall';
    const src = []; A.worker.scene.traverse((o) => { if (o.isSkinnedMesh) src.push(o); });
    let si = 0;
    m.traverse((o) => { if (o.isSkinnedMesh) { o.material = outfitMat(outfit, src[si++].userData); o.frustumCulled = false; } });
    this.root.add(m);
    m.updateMatrixWorld(true);
    const bone = (n) => m.getObjectByName('mixamorig' + n);
    this.b = {
      hips: bone('Hips'), head: bone('Head'), spine: bone('Spine2'), ra: bone('RightArm'), la: bone('LeftArm'), rf: bone('RightForeArm'), lf: bone('LeftForeArm'),
      rul: bone('RightUpLeg'), lul: bone('LeftUpLeg'), rl: bone('RightLeg'), ll: bone('LeftLeg'),
    };
    const g = gear(vest, helmet);
    const attach = (b, geo) => {
      if (!b || !geo) return;
      b.getWorldScale(_s);
      const h = new THREE.Object3D(); h.scale.setScalar(1 / _s.x);
      h.add(new THREE.Mesh(geo, gearMat()));
      b.add(h);
    };
    attach(this.b.head, g.helmet);
    attach(this.b.spine, g.vest);
    if (opts.headset) attach(this.b.head, g.headset);
    this.mixer = new THREE.AnimationMixer(m);
    const clip = (n) => A.worker.animations.find((a) => a.name === n);
    this.act = {};
    for (const n of ['idle', 'walk', 'run']) { const c = clip(n); if (c) this.act[n] = this.mixer.clipAction(c); }
    this.cur = null;
    this.play('idle');
    this.mixer.update(rand(0, 3));
    this.phi = rand(0, 6.28);
    if (this.seated) this.root.position.y = -SEAT.drop;
    scene.add(this.root);
  }
  play(n) {
    const a = this.act[n] || this.act.idle;
    if (!a || this.cur === a) return;
    a.reset().play();
    if (this.cur) a.crossFadeFrom(this.cur, 0.35, false);
    this.cur = a;
  }
  update(dt, t, mode) {
    if (this.seated) return this.updateSeated(dt, t, mode);
    this.play(mode === 'walk' ? 'walk' : mode === 'run' ? 'run' : 'idle');
    this.mixer.update(dt);
    const f = this.phi;
    if (mode === 'work' && this.b.ra) {
      const s1 = Math.sin(2.6 * t + f), s2 = Math.sin(2.6 * t + f + 1.7);
      this.rot(this.b.ra, 0, 0.6 + 0.15 * s1, 0.35 + 0.12 * s2);
      this.rot(this.b.la, 0, -0.6 - 0.15 * s2, -0.35 - 0.12 * s1);
      this.rot(this.b.rf, 0, 0.8 + 0.3 * s1, 0);
      this.rot(this.b.lf, 0, -0.8 - 0.3 * s2, 0);
    } else if (mode === 'alarm' && this.b.ra) {
      this.rot(this.b.ra, 0, 0, 2.4 + 0.3 * Math.sin(8 * t));
    }
    if (mode === 'idle') this.root.rotation.y = this.yaw + 0.15 * Math.sin(0.4 * t + f);
  }
  // Sentado frente a consola: piernas a 90°, manos al teclado; en alarma levanta la mano y voltea
  updateSeated(dt, t, mode) {
    this.play('idle');
    this.mixer.update(dt * 0.5);
    const f = this.phi, B = this.b, S2 = SEAT;
    const typing = mode !== 'alarm';
    this.rot(B.rul, S2.ul[0], S2.ul[1], S2.ul[2]);
    this.rot(B.lul, S2.ul[0], -S2.ul[1], -S2.ul[2]);
    this.rot(B.rl, S2.l[0], S2.l[1], S2.l[2]);
    this.rot(B.ll, S2.l[0], -S2.l[1], -S2.l[2]);
    const k = typing ? 0.05 * Math.sin(9 * t + f) : 0;
    this.rot(B.ra, S2.a[0], S2.a[1] + k, S2.a[2]);
    this.rot(B.la, S2.a[0], -S2.a[1] - k, -S2.a[2]);
    this.rot(B.rf, S2.f[0], S2.f[1] + 2 * k, S2.f[2]);
    this.rot(B.lf, S2.f[0], -S2.f[1] + 2 * k, -S2.f[2]);
    if (mode === 'alarm') this.rot(B.ra, 0, 0, 1.2 + 0.2 * Math.sin(7 * t));
    if (B.head) this.rot(B.head, typing ? 0.12 : -0.05, mode === 'alarm' ? 0.5 * Math.sin(1.5 * t) : 0.15 * Math.sin(0.3 * t + f), 0);
  }
  rot(b, x, y, z) {
    if (!b) return;
    _q.setFromEuler(_e.set(x, y, z));
    b.quaternion.multiply(_q);
  }
}

// ================= Personajes generados con Meshy AI (textura propia, rig Mixamo) =================
// Las poses se definen por DIRECCIONES en el espacio del personaje (independientes de los ejes de cada rig),
// así que cualquier personaje con nombres mixamorig* funciona sin recalibrar.
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function aim(bone, child, dirWorld, w = 1) {
  if (!bone || !child) return;
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(false, false);
  bone.getWorldPosition(_v1); child.getWorldPosition(_v2);
  _v2.sub(_v1).normalize();
  _qa.setFromUnitVectors(_v2, dirWorld);
  if (w < 1) _qa.slerp(_qb.identity(), 1 - w);
  bone.getWorldQuaternion(_qb);
  _qb.premultiply(_qa);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qb));
}
// poses: [hueso, hijo, dirección local (x = izquierda del personaje, y = arriba, z = al frente)]
const L = 1, R = -1;
const POSES = {
  idle: (t, f) => [
    ['LeftArm', 'LeftForeArm', [0.09, -1, -0.02]], ['RightArm', 'RightForeArm', [-0.09, -1, -0.02]],
    ['LeftForeArm', 'LeftHand', [0.02, -1, 0.22]], ['RightForeArm', 'RightHand', [-0.02, -1, 0.22]],
  ],
  work: (t, f) => {
    const a = Math.sin(2.6 * t + f), b = Math.sin(2.6 * t + f + 1.7);
    return [
      ['LeftArm', 'LeftForeArm', [0.25, -0.75, 0.55 + 0.1 * a]], ['RightArm', 'RightForeArm', [-0.25, -0.75, 0.55 + 0.1 * b]],
      ['LeftForeArm', 'LeftHand', [-0.25 + 0.15 * b, -0.15, 1]], ['RightForeArm', 'RightHand', [0.25 + 0.15 * a, -0.15, 1]],
      ['Spine1', 'Spine2', [0, 1, 0.12]],
    ];
  },
  alarm: (t) => [
    ['LeftArm', 'LeftForeArm', [0.09, -1, -0.02]], ['LeftForeArm', 'LeftHand', [0.02, -1, 0.22]],
    ['RightArm', 'RightForeArm', [-0.45, 0.85, 0.1]], ['RightForeArm', 'RightHand', [-0.25 + 0.35 * Math.sin(8 * t), 1, 0.1]],
  ],
  seated: (t, f, typing) => {
    const k = typing ? 0.04 * Math.sin(9 * t + f) : 0;
    return [
      ['LeftUpLeg', 'LeftLeg', [0.06, -0.08, 1]], ['RightUpLeg', 'RightLeg', [-0.06, -0.08, 1]],
      ['LeftLeg', 'LeftFoot', [0.02, -1, 0.12]], ['RightLeg', 'RightFoot', [-0.02, -1, 0.12]],
      ['LeftArm', 'LeftForeArm', [0.22, -0.85, 0.42]], ['RightArm', 'RightForeArm', [-0.22, -0.85, 0.42]],
      ['LeftForeArm', 'LeftHand', [-0.15, -0.2 + k, 1]], ['RightForeArm', 'RightHand', [0.15, -0.2 - k, 1]],
    ];
  },
};
const _d = new THREE.Vector3(), _rq = new THREE.Quaternion();
export class MeshyWorker {
  constructor(scene, x, z, yaw, gltf, opts = {}) {
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.yaw = yaw;
    const m = skClone(gltf.scene);
    m.traverse((o) => { if (o.isSkinnedMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 0.6; } });
    this.root.add(m); this.model = m;
    this.bones = {};
    m.traverse((o) => { if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o; });
    this.rest = {};
    for (const k in this.bones) this.rest[k] = this.bones[k].quaternion.clone();
    this.mixer = new THREE.AnimationMixer(m);
    const walk = gltf.animations.find((a) => /walk/i.test(a.name)), run = gltf.animations.find((a) => /run/i.test(a.name));
    this.walk = walk && this.mixer.clipAction(walk);
    this.run = run && this.mixer.clipAction(run);
    // si el modelo trae animaciones de reposo o de estar sentado tecleando, se usan en lugar de las poses
    const idle = gltf.animations.find((a) => /idle|stand|breath/i.test(a.name)), sit = gltf.animations.find((a) => /typ|sit/i.test(a.name));
    this.idleA = idle && this.mixer.clipAction(idle);
    this.sitA = sit && this.mixer.clipAction(sit);
    this.seated = !!opts.seated;
    this.phi = rand(0, 6.28);
    m.updateMatrixWorld(true);
    // sentado: (x, z) es el centro del asiento; la cadera se acomoda sobre él tras aplicar la pose (ver seatAlign)
    this.seat = { x, z }; this.alignN = 0;
    this.mode = null;
    scene.add(this.root);
  }
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const a of [this.walk, this.run, this.idleA, this.sitA]) if (a) a.stop();
    const a = { walk: this.walk, run: this.run || this.walk, clipIdle: this.idleA, clipSit: this.sitA }[mode];
    if (a) a.reset().play();
    else for (const k in this.bones) this.bones[k].quaternion.copy(this.rest[k]);
  }
  update(dt, t, mode) {
    if (this.seated) mode = mode === 'alarm' ? 'seatedAlarm' : 'seated';
    const clip = mode === 'walk' || mode === 'run' ? mode : (mode === 'idle' && this.idleA) ? 'clipIdle' : (mode === 'seated' && this.sitA) ? 'clipSit' : 'pose';
    this.setMode(clip);
    if (clip !== 'pose') { this.mixer.update(dt); this.seatAlign(); return; }
    for (const k in this.bones) this.bones[k].quaternion.copy(this.rest[k]);
    // respiración leve
    if (this.bones.Spine) this.bones.Spine.quaternion.multiply(_rq.setFromAxisAngle(_d.set(1, 0, 0), 0.015 * Math.sin(1.6 * t + this.phi)));
    let list;
    if (mode === 'seated' || mode === 'seatedAlarm') {
      list = POSES.seated(t, this.phi, mode === 'seated');
      if (mode === 'seatedAlarm') list = list.filter((p) => !/^Right(Arm|ForeArm)/.test(p[0])).concat(POSES.alarm(t).filter((p) => /^Right/.test(p[0])));
    } else list = (POSES[mode] || POSES.idle)(t, this.phi);
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_rq);
    for (const [b, c, d] of list) {
      _d.set(d[0], d[1], d[2]).normalize().applyQuaternion(_rq);
      aim(this.bones[b], this.bones[c], _d.clone());
    }
    if (mode === 'idle' && !this.seated) this.root.rotation.y = this.yaw + 0.12 * Math.sin(0.4 * t + this.phi);
    this.seatAlign();
  }
  // Coloca la cadera (hueso Hips) sobre el asiento: silla con cojín a 0.50 m, cadera ~0.10 m arriba y 6 cm hacia el respaldo.
  // Se mide con la pose ya aplicada, así funciona igual con la pose por código o con un clip "Sitting" de Meshy.
  seatAlign() {
    if (!this.seated || this.alignN >= 3 || !this.bones.Hips) return;
    if (this.alignN === 0) this.floorY = this.root.position.y;
    this.alignN++;
    this.root.updateMatrixWorld(true);
    this.bones.Hips.getWorldPosition(_v1);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.root.position.x += this.seat.x - 0.06 * fx - _v1.x;
    this.root.position.z += this.seat.z - 0.06 * fz - _v1.z;
    this.root.position.y += this.floorY + 0.6 - _v1.y;
  }
}

// Crea una persona para un rol: modelo de Meshy si existe, si no el personaje de respaldo con uniforme pintado.
const _turn = {};
export function makePerson(scene, role, x, z, yaw, fallback = {}) {
  const vs = A.roleVariants && A.roleVariants[role];
  let g = A.roles && A.roles[role];
  if (vs && vs.length > 1) { const i = fallback.variant ?? (_turn[role] = (_turn[role] ?? -1) + 1); g = vs[i % vs.length]; }
  if (g) return new MeshyWorker(scene, x, z, yaw, g, { seated: fallback.seated });
  return new RealWorker(scene, x, z, yaw, fallback.vest ?? null, fallback.helmet ?? null, fallback);
}
