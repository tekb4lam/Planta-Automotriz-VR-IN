import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { A } from './assets.js';
import { P, mergeColored, rand } from './util.js';

// Operarios con esqueleto y animaciones reales (personaje Mixamo) + EPP: casco y chaleco de alta visibilidad.
let MATS, GEAR = {};
const _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function mats() {
  if (MATS) return MATS;
  MATS = {
    suit: new THREE.MeshStandardMaterial({ color: 0x24344f, roughness: 0.85, metalness: 0 }),
    joints: new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7, metalness: 0 }),
    gear: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }),
  };
  return MATS;
}
function gear(vest, helmet) {
  const k = vest + '_' + helmet;
  if (GEAR[k]) return GEAR[k];
  const refl = 0xd9d9d9;
  GEAR[k] = {
    helmet: mergeColored([[P.sph(0.135, 0, 0.115, 0.01, 1.0, 0.7, 1.12), helmet], [P.cyl(0.155, 0.015, 0, 0.105, 0.04), helmet], [P.box(0.16, 0.02, 0.07, 0, 0.105, 0.15), helmet]]),
    vest: mergeColored([
      [[P.cyl(1, 1, 0, 0, 0)[0], 0, -0.09, 0.02, 0, 0, 0, 0.215, 0.5, 0.16], vest],
      [[P.cyl(1, 1, 0, 0, 0)[0], 0, -0.22, 0.02, 0, 0, 0, 0.218, 0.045, 0.163], refl], [[P.cyl(1, 1, 0, 0, 0)[0], 0, -0.06, 0.02, 0, 0, 0, 0.218, 0.045, 0.163], refl],
    ]),
  };
  return GEAR[k];
}

export class RealWorker {
  constructor(scene, x, z, yaw, vest = 0xff8c1a, helmet = 0xffffff) {
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); this.root.rotation.y = yaw; this.yaw = yaw;
    const m = skClone(A.worker.scene);
    const M = mats();
    m.traverse((o) => {
      if (o.isSkinnedMesh || o.isMesh) {
        o.material = /Joints/i.test(o.name) ? M.joints : M.suit;
        o.frustumCulled = false;
      }
    });
    this.root.add(m);
    m.updateMatrixWorld(true);
    const bone = (n) => m.getObjectByName('mixamorig' + n);
    this.b = { head: bone('Head'), spine: bone('Spine2'), ra: bone('RightArm'), la: bone('LeftArm'), rf: bone('RightForeArm'), lf: bone('LeftForeArm') };
    const g = gear(vest, helmet);
    const attach = (b, geo) => {
      if (!b) return;
      b.getWorldScale(_s);
      const h = new THREE.Object3D(); h.scale.setScalar(1 / _s.x);
      h.add(new THREE.Mesh(geo, M.gear));
      b.add(h);
    };
    attach(this.b.head, g.helmet);
    attach(this.b.spine, g.vest);
    this.mixer = new THREE.AnimationMixer(m);
    const clip = (n) => A.worker.animations.find((a) => a.name === n);
    this.act = {};
    for (const n of ['idle', 'walk', 'agree', 'run']) { const c = clip(n); if (c) this.act[n] = this.mixer.clipAction(c); }
    this.cur = null;
    this.play('idle');
    this.mixer.update(rand(0, 3));
    this.phi = rand(0, 6.28);
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
    this.play(mode === 'walk' ? 'walk' : mode === 'run' ? 'run' : 'idle');
    this.mixer.update(dt);
    const f = this.phi;
    if (mode && mode.startsWith && mode.startsWith('T:') && this.b.ra) { const [x, y, z, fx2, fy, fz] = mode.slice(2).split(',').map(Number); this.rot(this.b.ra, x, y, z); this.rot(this.b.la, x, -y, -z); this.rot(this.b.rf, fx2, fy, fz); this.rot(this.b.lf, fx2, -fy, -fz); }
    else if (mode === 'work' && this.b.ra) {
      // brazos al frente manipulando piezas (se suma a la animación base)
      const s1 = Math.sin(2.6 * t + f), s2 = Math.sin(2.6 * t + f + 1.7);
      this.rot(this.b.ra, 0, 0.6 + 0.15 * s1, 0.35 + 0.12 * s2);
      this.rot(this.b.la, 0, -0.6 - 0.15 * s2, -0.35 - 0.12 * s1);
      this.rot(this.b.rf, 0, 0.8 + 0.3 * s1, 0);
      this.rot(this.b.lf, 0, -0.8 - 0.3 * s2, 0);
    } else if (mode === 'alarm' && this.b.ra) {
      this.rot(this.b.ra, 0, 0, 2.4 + 0.3 * Math.sin(8 * t), 0);
    }
    if (mode === 'idle') this.root.rotation.y = this.yaw + 0.15 * Math.sin(0.4 * t + f);
  }
  rot(b, x, y, z, x2 = 0) {
    _q.setFromEuler(_e.set(x + x2 * 0, y, z));
    b.quaternion.multiply(_q);
    if (x2) { _q.setFromEuler(_e.set(x2, 0, 0)); b.quaternion.multiply(_q); }
  }
}
