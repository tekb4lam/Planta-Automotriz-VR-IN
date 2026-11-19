import * as THREE from 'three';
import { PRESS } from './config.js';
import { Batcher, G, M, smooth, rand } from './util.js';
import { S } from './state.js';

// Línea tándem de 5 prensas con transfer de láminas
export class PressLine {
  constructor(scene, fx, audio) {
    this.fx = fx; this.audio = audio;
    const sb = new Batcher();
    const z = PRESS.z;
    this.TDC = 4.1; this.BDC = 2.48;
    this.presses = [];
    for (const x of PRESS.xs) {
      // marco
      for (const dx of [-2.55, 2.55]) for (const dz of [-1.65, 1.65]) sb.box(0.95, 7.4, 0.95, M.pressBlue, x + dx, 3.7, z + dz);
      sb.box(6.4, 1.9, 4.3, M.pressBlue, x, 7.9, z);
      sb.box(6.2, 1.0, 4.1, M.pressBlue, x, 0.5, z);
      sb.box(4.2, 0.45, 2.8, M.pressDark, x, 1.22, z); // troquel inferior
      sb.box(1.2, 1.2, 1.2, M.pressDark, x - 2.2, 9.4, z); // motor
      sb.cyl(1.0, 0.5, M.darkSteel, x + 1.6, 9.2, z, Math.PI / 2); // volante
      sb.box(7.0, 0.02, 5.2, M.hazard, x, 0.012, z);
      const slide = new THREE.Group();
      const s1 = new THREE.Mesh(G.box, M.steel); s1.scale.set(4.2, 0.9, 3.0); slide.add(s1);
      const s2 = new THREE.Mesh(G.box, M.pressDark); s2.scale.set(4.0, 0.5, 2.7); s2.position.y = -0.7; slide.add(s2);
      const rod = new THREE.Mesh(G.cyl, M.steel); rod.scale.set(0.18, 3, 0.18); rod.position.y = 1.9; slide.add(rod);
      slide.position.set(x, this.TDC, z);
      scene.add(slide);
      this.presses.push({ x, slide, stuck: false });
    }
    // bobina y desenrollador
    const x0 = PRESS.xs[0] - 9;
    sb.cyl(1.1, 1.4, M.coil, x0 - 1.5, 1.4, z, Math.PI / 2);
    sb.box(0.3, 1.5, 2.0, M.darkSteel, x0 - 1.5, 0.75, z);
    sb.box(3.0, 0.9, 2.2, M.pressDark, x0 + 1.2, 0.45, z);
    // salida: racks de piezas
    const xo = PRESS.xs[PRESS.xs.length - 1] + 7.5;
    for (let i = 0; i < 2; i++) {
      sb.box(2.4, 0.1, 1.8, M.darkSteel, xo + i * 2.8, 0.15, z);
      for (let k = 0; k < 8; k++) sb.box(1.8, 0.04, 1.2, M.sheet, xo + i * 2.8, 0.25 + k * 0.08, z, 0, 0.1, 0);
      for (const dx of [-1.1, 1.1]) sb.box(0.08, 1.4, 1.7, M.darkSteel, xo + i * 2.8 + dx, 0.8, z);
    }
    sb.box(3.5, 0.8, 1.6, M.darkSteel, xo - 2.8, 0.4, z);
    // cercado
    const fx0 = x0 - 3, fx1 = xo + 4.5;
    for (const fz of [z - 6.5, z + 6.5]) {
      for (let x = fx0; x < fx1; x += 2) {
        sb.box(2, 2.2, 0.02, M.fence, x + 1, 1.2, fz);
        sb.box(0.06, 2.3, 0.06, M.fencePost, x, 1.15, fz);
      }
    }
    sb.build(scene);
    // láminas
    this.sheets = [];
    for (let i = 0; i <= PRESS.xs.length; i++) {
      const m = new THREE.Mesh(G.box, M.sheet);
      m.scale.set(1.8, 0.03, 1.3);
      scene.add(m);
      this.sheets.push(m);
    }
    this.t = 0;
    this.cycle = PRESS.cycle;
    this.lastPhase = 0;
    this.shake = 0;
    this.speedTarget = PRESS.cycle;
  }
  reset() {
    this.cycle = PRESS.cycle; this.speedTarget = PRESS.cycle; this.shake = 0;
    this.presses.forEach((p) => (p.stuck = false));
    S.pressStopped = false; S.pressSpm = 12;
  }
  overspeed() { this.speedTarget = 1.5; this.shake = 0.05; }
  crash(idx = 2) {
    S.pressStopped = true;
    const p = this.presses[idx];
    p.stuck = true;
    const pos = new THREE.Vector3(p.x, 1.6, PRESS.z + 1.6);
    this.fx.sparks.emit(pos, 260, new THREE.Color(1, 0.7, 0.25), 5, 1.2, null, 1.2);
    this.audio?.crash(pos);
    this.crashPos = pos;
  }
  update(dt) {
    this.cycle += (this.speedTarget - this.cycle) * Math.min(1, dt * 0.6);
    if (!S.pressStopped) {
      this.t += dt;
      S.pressSpm = Math.round(60 / this.cycle);
    } else S.pressSpm = 0;
    const T = this.cycle;
    const u = (this.t % T) / T;
    const n = PRESS.xs.length;
    const press = u < 0.45;
    const off = press ? Math.sin(Math.PI * u / 0.45) : 0;
    for (const p of this.presses) {
      const y = p.stuck ? this.BDC - 0.05 : this.TDC - (this.TDC - this.BDC) * off;
      p.slide.position.y = y;
      p.slide.position.x = p.x + (this.shake && !S.pressStopped ? rand(-1, 1) * this.shake : 0);
    }
    // golpe en punto muerto inferior
    if (!S.pressStopped && this.lastPhase < 0.225 && u >= 0.225) this.audio?.thump(new THREE.Vector3(PRESS.xs[2], 1, PRESS.z));
    this.lastPhase = u;
    // transfer de láminas
    const v = press ? 0 : smooth((u - 0.45) / 0.55);
    const lift = press ? 0 : Math.sin(Math.PI * (u - 0.45) / 0.55);
    const xs = [PRESS.xs[0] - 9, ...PRESS.xs, PRESS.xs[n - 1] + 7.5];
    for (let i = 0; i <= n; i++) {
      const s = this.sheets[i];
      const a = xs[i], b = xs[i + 1];
      const x = press || S.pressStopped ? a : a + (b - a) * v;
      s.position.set(x, (i === 0 ? 1.0 : 1.48) + 0.9 * lift * (S.pressStopped ? 0 : 1), PRESS.z);
      s.scale.y = i === 0 ? 0.03 : 0.16;
      if (S.pressStopped && i === 3) { s.rotation.z = 0.5; s.position.y = 1.8; }
      else s.rotation.z = 0;
    }
    if (S.pressStopped && this.crashPos && Math.random() < dt * 6) {
      this.fx.smoke.emit(this.crashPos, 0x3a3a3a, 1.6, 6, 0.9);
      if (Math.random() < 0.3) this.fx.sparks.emit(this.crashPos, 12, new THREE.Color(1, 0.6, 0.2), 3, 1, null, 0.6);
    }
  }
}
