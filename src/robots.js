import * as THREE from 'three';
import { A } from './assets.js';
import { G, M, P, mergeColored, damp, smooth, rand } from './util.js';

// Robots reales (KUKA KR 210 para soldadura/manipulación, ABB IRB 5400 para pintura) con ejes separados.
// Las trayectorias vienen de una cinemática inversa resuelta fuera de línea (robot_paths.json).
const TPL = {};
function template(kind) {
  if (TPL[kind]) return TPL[kind];
  const g = kind === 'kr210' ? A.kr210 : A.irb5400;
  const info = kind === 'kr210' ? A.kr210Info : A.irb5400Info;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide });
  g.scene.traverse((o) => {
    if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.material = mat; }
  });
  TPL[kind] = { scene: g.scene, joints: info.joints, mat };
  return TPL[kind];
}

let TOOLS;
function tools() {
  if (TOOLS) return TOOLS;
  const dk = 0x30343a, cu = 0xb87333, gr = 0x8a9299;
  TOOLS = {
    weld: mergeColored([
      [P.box(0.3, 0.22, 0.24, 0.17, 0, 0.1), dk], [P.box(0.46, 0.06, 0.06, 0.42, 0, 0.21), gr], [P.box(0.06, 0.06, 0.26, 0.64, 0, 0.1), gr],
      [P.box(0.4, 0.06, 0.06, 0.4, 0, -0.1), gr], [P.box(0.06, 0.06, 0.12, 0.6, 0, -0.06), gr],
      [P.cyl(0.016, 0.07, 0.62, 0, 0.0, Math.PI / 2), cu], [P.cyl(0.05, 0.08, 0.05, 0, 0, 0, 0, Math.PI / 2), dk],
    ]),
    paint: mergeColored([[P.cyl(0.075, 0.24, 0.13, 0, 0, 0, 0, Math.PI / 2), 0xe8e8e4], [P.cyl(0.12, 0.05, 0.28, 0, 0, 0, 0, Math.PI / 2), 0xb5b5b5], [P.cyl(0.03, 0.06, 0.32, 0, 0, 0, 0, Math.PI / 2), 0x666666]]),
    grip: mergeColored([[P.box(0.1, 0.16, 0.16, 0.06, 0, 0), dk], [P.box(0.05, 0.9, 0.12, 0.16, 0, 0), dk], [P.box(0.05, 0.12, 0.7, 0.16, 0, 0), dk],
      ...[[0.4, 0.3], [-0.4, 0.3], [0.4, -0.3], [-0.4, -0.3]].map(([y, z]) => [P.cyl(0.05, 0.05, 0.2, y, z, 0, 0, Math.PI / 2), 0x222222])]),
  };
  return TOOLS;
}

const SPARK = new THREE.Color(1.0, 0.72, 0.3);
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3();

export class RealRobot {
  // kind: 'kr210' | 'irb5400'; job: 'weld' | 'paint' | 'pick'
  constructor(scene, x, z, yaw, kind, job) {
    const t = template(kind);
    this.kind = kind; this.job = job;
    this.type = job === 'paint' ? 'paint' : job === 'pick' ? 'grip' : 'weld';
    this.paths = A.robot_pathsInfo[kind];
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z); this.root.rotation.y = yaw;
    const inner = t.scene.clone(true);
    inner.rotation.x = -Math.PI / 2;
    this.root.add(inner);
    // articulaciones (en orden de la cadena)
    this.joints = t.joints.map((j) => ({ node: inner.getObjectByName('R_' + j.name), axis: new THREE.Vector3(...j.axis), name: j.name }));
    this.free = this.joints.filter((j) => j.name !== 'joint_5b');
    this.mimic = this.joints.find((j) => j.name === 'joint_5b');
    const flange = inner.getObjectByName('L_link_6');
    const tool = new THREE.Mesh(tools()[job === 'paint' ? 'paint' : job === 'pick' ? 'grip' : 'weld'], M.vc);
    flange.add(tool);
    this.tip = new THREE.Object3D(); this.tip.position.set(this.paths.tool[0], 0, 0); flange.add(this.tip);
    if (job === 'pick') {
      this.pane = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.75), M.glass);
      this.pane.position.set(0.24, 0, 0); flange.add(this.pane);
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.03; this.ring.visible = false;
    this.root.add(this.ring);
    this.q = this.paths.home.slice();
    this.mode = 'normal';
    this.phi = rand(0, 6.28);
    this.timer = rand(0, 1);
    this.idx = (Math.random() * 4) | 0;
    this.prev = this.q.slice();
    this.cool = 0;
    // secuencia de soldadura propia (subconjunto aleatorio de puntos)
    if (job === 'weld') {
      const pts = this.paths.weld.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 6 + ((Math.random() * 4) | 0));
      this.seq = pts.map((i) => this.paths.weld[i]);
    } else if (job === 'paint') this.seq = [...this.paths.side, ...this.paths.roof];
    else this.seq = [this.paths.pick, this.paths.place];
    this.apply();
    scene.add(this.root);
  }
  apply() {
    this.free.forEach((j, i) => j.node.quaternion.setFromAxisAngle(j.axis, this.q[i]));
    if (this.mimic) {
      const i5 = this.free.findIndex((j) => j.name === 'joint_5');
      this.mimic.node.quaternion.setFromAxisAngle(this.mimic.axis, -this.q[i5]);
    }
  }
  target(dt, working) {
    const n = this.seq.length;
    if (this.job === 'weld') {
      const Tm = 0.55, Td = 0.45;
      this.timer += dt;
      if (this.timer > Tm + Td) { this.timer = 0; this.prev = this.seq[this.idx]; this.idx = (this.idx + 1) % n; }
      const a = this.prev, b = this.seq[this.idx], k = smooth(this.timer / Tm);
      this.welding = this.timer > Tm;
      return a.map((v, i) => v + (b[i] - v) * k);
    }
    if (this.job === 'paint') {
      this.timer += dt * 1.6;
      const f = this.timer % n, i = Math.floor(f), k = f - i;
      const a = this.seq[i], b = this.seq[(i + 1) % n];
      return a.map((v, j) => v + (b[j] - v) * smooth(k));
    }
    // pick & place
    this.timer += dt / 3.2;
    const ph = this.timer % 1;
    const k = ph < 0.15 ? 0 : ph < 0.5 ? smooth((ph - 0.15) / 0.35) : ph < 0.65 ? 1 : 1 - smooth((ph - 0.65) / 0.35);
    if (this.pane) this.pane.visible = ph < 0.6;
    const a = this.seq[0], b = this.seq[1];
    return a.map((v, i) => v + (b[i] - v) * k);
  }
  update(dt, t, working, fx, sprayColor, audio) {
    let tgt, kk = 6;
    this.welding = false;
    if (this.mode === 'rogue') {
      const base = this.seq[this.idx % this.seq.length];
      const f = this.phi;
      tgt = base.map((v, i) => v + [1.1, 0.5, 0.6, 1.5, 0.9, 2.0][i] * Math.sin((1.7 + i * 0.4) * t + f + i));
      this.welding = this.job === 'weld';
      kk = 4;
    } else if (working) tgt = this.target(dt, working);
    else { tgt = this.paths.home; kk = 2.5; if (this.pane) this.pane.visible = false; }
    for (let i = 0; i < this.q.length; i++) this.q[i] = damp(this.q[i], tgt[i], kk, dt);
    this.apply();
    if (this.welding) {
      this.cool -= dt;
      if (this.cool <= 0) {
        this.cool = 0.06;
        this.root.updateMatrixWorld(true);
        this.tip.getWorldPosition(_v);
        fx.sparks.emit(_v, 10, SPARK, 2.4, 1, null, 0.5);
        fx.flash(_v);
        if (Math.random() < 0.15) audio?.zap(_v);
      }
    }
    if (this.job === 'paint' && working && this.mode !== 'rogue' && sprayColor && Math.random() < dt * 50) {
      this.root.updateMatrixWorld(true);
      this.tip.getWorldPosition(_v);
      _d.set(1, 0, 0).transformDirection(this.tip.parent.matrixWorld).multiplyScalar(1.6);
      fx.mist.emit(_v, 3, sprayColor, 1.0, 0.25, _d, 0.9);
    }
    if (this.ring.visible !== (this.mode === 'rogue')) this.ring.visible = this.mode === 'rogue';
    if (this.ring.visible) this.ring.material.opacity = 0.4 + 0.4 * Math.sin(t * 8);
  }
}
