import * as THREE from 'three';
import { PRESS } from './config.js';
import { Batcher, G, M, smooth, rand, makeSign } from './util.js';
import { S } from './state.js';
import { machine } from './assets.js';

// Línea tándem de 5 prensas con transfer de láminas
export class PressLine {
  constructor(scene, fx, audio) {
    this.fx = fx; this.audio = audio;
    const sb = new Batcher();
    const z = PRESS.z;
    this.TDC = 4.1; this.BDC = 2.48;
    this.presses = [];
    const red = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
    const hmiScr = new THREE.MeshBasicMaterial({ color: 0x2a6fd6, toneMapped: false });
    const white = new THREE.MeshStandardMaterial({ color: 0xe4e7ea, metalness: 0.3, roughness: 0.45 });
    // Prensa de Meshy (marco con ventana recortada) + carro procedural animado; si no existe, prensa procedural.
    const probe = machine('prensa', { height: 6.9 });
    this.real = !!probe;
    this.bedY = 1.33; this.off = 0;
    let win = null;
    if (this.real) {
      const tw = probe.userData.toW;
      const a = tw(-0.24, -0.35, -0.40), b = tw(0.44, 0.42, 0.53);
      win = { x0: a.x, x1: b.x, y0: a.y, y1: b.y, zb: a.z, zf: b.z, cx: (a.x + b.x) / 2 };
      this.bedY = a.y + 0.02; this.off = win.cx;
      this.TDC = win.y1 - 0.45; this.BDC = this.bedY + 0.97;
    }
    PRESS.xs.forEach((x, pi) => {
      // ---- cimentación y fosa ----
      sb.box(7.6, 0.03, 6.4, M.plate, x, 0.015, z);
      sb.box(7.6, 0.03, 0.12, M.hazard, x, 0.03, z + 3.2); sb.box(7.6, 0.03, 0.12, M.hazard, x, 0.03, z - 3.2);
      if (this.real) {
        const m = pi === 0 ? probe : machine('prensa', { height: 6.9 });
        m.position.set(x, 0, z); scene.add(m);
        const cx = x + win.cx, w = win.x1 - win.x0, h = win.y1 - win.y0, d = win.zf - win.zb;
        // interior oscuro de la ventana (fondo, laterales y techo) para ocultar el recorte
        sb.box(w, h, 0.08, M.pressDark, cx, (win.y0 + win.y1) / 2 + 0.1, z + win.zb);
        for (const sx of [-1, 1]) sb.box(0.08, h, d, M.pressDark, cx + sx * (w / 2 - 0.02), (win.y0 + win.y1) / 2 + 0.1, z + (win.zb + win.zf) / 2);
        sb.box(w, 0.1, d, M.pressDark, cx, win.y1 - 0.02, z + (win.zb + win.zf) / 2);
        // troquel inferior sobre la mesa
        sb.box(w - 0.4, 0.14, d * 0.7, M.darkSteel, cx, this.bedY + 0.07, z);
        for (const dx of [-1, 1]) sb.box(0.1, 0.16, d * 0.7, M.yellow, cx + dx * (w / 2 - 0.25), this.bedY + 0.08, z);
        // cortinas de luz, HMI con paro de emergencia y unidad hidráulica
        for (const dx of [-1, 1]) {
          sb.box(0.06, 1.8, 0.06, M.yellow, cx + dx * (w / 2 + 0.15), 1.9 + this.bedY - 1.33, z + win.zf + 0.25);
          sb.box(0.012, 1.6, 0.02, red, cx + dx * (w / 2 + 0.12), 1.9 + this.bedY - 1.33, z + win.zf + 0.25);
        }
        sb.box(0.5, 1.3, 0.35, M.cabinet, x + 3.0, 0.65, z + 3.4);
        sb.box(0.42, 0.3, 0.02, hmiScr, x + 3.0, 1.15, z + 3.58);
        sb.cyl(0.05, 0.05, red, x + 3.15, 0.85, z + 3.6, Math.PI / 2);
        sb.box(1.6, 1.2, 1.0, M.cabinetDark, x - 2.0, 0.6, z - 3.0);
        // carro (slide) con troquel superior
        const slide = new THREE.Group();
        const s1 = new THREE.Mesh(G.box, white); s1.scale.set(w - 0.2, 0.75, d * 0.75); slide.add(s1);
        const s1b = new THREE.Mesh(G.box, M.pressDark); s1b.scale.set(w - 0.18, 0.08, d * 0.75 + 0.02); s1b.position.y = 0.2; slide.add(s1b);
        const s2 = new THREE.Mesh(G.box, M.pressDark); s2.scale.set(w - 0.5, 0.3, d * 0.65); s2.position.y = -0.52; slide.add(s2);
        for (const dx of [-1, 1]) { const yb = new THREE.Mesh(G.box, M.yellow); yb.scale.set(0.1, 0.26, d * 0.65); yb.position.set(dx * (w / 2 - 0.3), -0.52, 0); slide.add(yb); }
        for (const dz of [-0.5, 0.5]) { const rod = new THREE.Mesh(G.cyl, M.rim); rod.scale.set(0.14, 2.0, 0.14); rod.position.set(0, 1.3, dz); slide.add(rod); }
        slide.position.set(cx, this.TDC, z);
        scene.add(slide);
        this.presses.push({ x, sx: cx, slide, stuck: false });
        (this.plates = this.plates || []).push([x, pi]);
        return;
      }
      // ---- bancada inferior y mesa móvil (bolster) con rieles de cambio rápido ----
      sb.box(6.6, 1.0, 4.4, M.pressBlue, x, 0.5, z);
      sb.box(5.0, 0.15, 3.4, M.steel, x, 1.075, z);
      for (let k = -2; k <= 2; k++) sb.box(5.0, 0.02, 0.05, M.darkSteel, x, 1.16, z + k * 0.6);
      for (const dx of [-1.6, 1.6]) sb.box(0.18, 0.06, 4.6, M.yellow, x + dx, 0.03, z + 4.4);
      // ---- troquel inferior: zapata, postes guía y punzón con forma de panel ----
      sb.box(4.2, 0.18, 2.8, M.pressDark, x, 1.24, z);
      for (const dx of [-1.9, 1.9]) for (const dz of [-1.2, 1.2]) sb.cyl(0.07, 0.9, M.rim, x + dx, 1.75, z + dz);
      sb.add(G.sphere, M.darkSteel, x, 1.33, z, 0, 0, 0, 1.6, 0.13, 1.1);
      for (const dx of [-2.05, 2.05]) sb.box(0.12, 0.2, 2.8, M.yellow, x + dx, 1.33, z);
      // ---- columnas con paneles de acceso, guías del carro y tirantes ----
      for (const dx of [-2.75, 2.75]) for (const dz of [-1.7, 1.7]) {
        sb.box(1.1, 6.2, 1.1, M.pressBlue, x + dx, 4.1, z + dz);
        sb.box(0.7, 2.2, 0.03, M.darkSteel, x + dx, 3.6, z + dz + Math.sign(dz) * 0.56);
        sb.box(0.12, 4.6, 0.25, M.rim, x + dx - Math.sign(dx) * 0.6, 4.2, z + dz - Math.sign(dz) * 0.2);
        sb.cyl(0.2, 0.25, M.darkSteel, x + dx, 9.32, z + dz);
        sb.cyl(0.2, 0.25, M.darkSteel, x + dx, 0.12, z + dz + Math.sign(dz) * 0.0);
      }
      // ---- corona con accionamiento servo, volante y guarda ----
      sb.box(7.0, 2.0, 4.8, M.pressBlue, x, 8.2, z);
      sb.box(7.06, 0.25, 4.86, white, x, 7.3, z);
      for (const dz of [-0.8, 0.8]) { sb.cyl(0.45, 1.6, M.darkSteel, x - 1.6, 9.7, z + dz, 0, 0, Math.PI / 2); sb.cyl(0.47, 0.12, M.steel, x - 0.75, 9.7, z + dz, 0, 0, Math.PI / 2); }
      sb.box(1.6, 1.0, 2.6, M.pressDark, x + 0.6, 9.7, z);
      sb.cyl(1.15, 0.5, M.yellow, x + 2.3, 9.5, z, Math.PI / 2);
      // barandal y escalera de acceso a la corona
      for (const dz of [-2.3, 2.3]) { sb.box(7.0, 0.05, 0.05, M.yellow, x, 10.25, z + dz); sb.box(7.0, 0.05, 0.05, M.yellow, x, 9.75, z + dz); }
      for (const dx of [-3.45, 3.45]) { sb.box(0.05, 0.05, 4.6, M.yellow, x + dx, 10.25, z); }
      for (let k = 0; k <= 6; k++) { sb.box(0.05, 1.05, 0.05, M.yellow, x - 3.45 + k * 1.15, 9.72, z - 2.3); sb.box(0.05, 1.05, 0.05, M.yellow, x - 3.45 + k * 1.15, 9.72, z + 2.3); }
      for (const dx of [-0.25, 0.25]) sb.box(0.05, 8.0, 0.05, M.yellow, x + 3.6 + dx, 5.2, z - 2.35);
      for (let k = 0; k < 26; k++) sb.box(0.5, 0.03, 0.03, M.yellow, x + 3.6, 1.4 + k * 0.32, z - 2.35);
      // ---- cortinas de luz de seguridad y pedestal HMI con paro de emergencia ----
      for (const dx of [-2.15, 2.15]) for (const dz of [2.45, -2.45]) {
        sb.box(0.06, 1.8, 0.06, M.yellow, x + dx, 1.9, z + dz);
        sb.box(0.012, 1.6, 0.02, red, x + dx - Math.sign(dx) * 0.035, 1.9, z + dz);
      }
      sb.box(0.5, 1.3, 0.35, M.cabinet, x + 3.0, 0.65, z + 3.4);
      sb.box(0.42, 0.3, 0.02, hmiScr, x + 3.0, 1.15, z + 3.58);
      sb.cyl(0.05, 0.05, red, x + 3.15, 0.85, z + 3.6, Math.PI / 2);
      // ---- unidad hidráulica / lubricación posterior ----
      sb.box(1.6, 1.2, 1.0, M.cabinetDark, x - 2.0, 0.6, z - 3.6);
      sb.cyl(0.05, 2.2, M.steel, x - 1.5, 1.7, z - 3.2); sb.box(0.05, 0.05, 1.0, M.steel, x - 1.5, 2.8, z - 2.7);
      // ---- carro (slide) móvil con troquel superior ----
      const slide = new THREE.Group();
      const s1 = new THREE.Mesh(G.box, white); s1.scale.set(4.3, 0.95, 3.1); slide.add(s1);
      const s1b = new THREE.Mesh(G.box, M.pressDark); s1b.scale.set(4.32, 0.08, 3.12); s1b.position.y = 0.2; slide.add(s1b);
      const s2 = new THREE.Mesh(G.box, M.pressDark); s2.scale.set(4.1, 0.35, 2.75); s2.position.y = -0.65; slide.add(s2);
      for (const dx of [-2.05, 2.05]) { const yb = new THREE.Mesh(G.box, M.yellow); yb.scale.set(0.12, 0.3, 2.75); yb.position.set(dx, -0.65, 0); slide.add(yb); }
      for (const dz of [-0.8, 0.8]) { const rod = new THREE.Mesh(G.cyl, M.rim); rod.scale.set(0.16, 3.0, 0.16); rod.position.set(0, 1.9, dz); slide.add(rod); }
      slide.position.set(x, this.TDC, z);
      scene.add(slide);
      this.presses.push({ x, sx: x, slide, stuck: false });
      this.plates = this.plates || [];
      this.plates.push([x, pi]);
    });
    // transfer: rieles longitudinales sobre la línea (barras de alimentación)
    const xa = PRESS.xs[0] - 9, xb = PRESS.xs[PRESS.xs.length - 1] + 7.5;
    for (const dz of [-1.25, 1.25]) sb.box(xb - xa, 0.18, 0.12, M.steel, (xa + xb) / 2, this.real ? this.bedY + 1.15 : 3.2, z + dz);
    // pasarela posterior a nivel de coronas
    sb.box(xb - xa, 0.08, 1.2, M.plate, (xa + xb) / 2, 9.25, z - 3.1);
    sb.box(xb - xa, 0.05, 0.05, M.yellow, (xa + xb) / 2, 10.3, z - 3.7);
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
    this.bars = [];
    for (let i = 0; i <= PRESS.xs.length; i++) {
      const m = new THREE.Mesh(G.box, M.sheet);
      m.scale.set(1.8, 0.03, 1.3);
      scene.add(m);
      this.sheets.push(m);
      const bar = new THREE.Group();
      const cb = new THREE.Mesh(G.box, M.darkSteel); cb.scale.set(0.12, 0.1, 2.6); bar.add(cb);
      for (const dz of [-0.45, 0.45]) for (const dx of [-0.6, 0.6]) { const cup = new THREE.Mesh(G.cyl, M.black); cup.scale.set(0.06, 0.12, 0.06); cup.position.set(dx, -0.1, dz); bar.add(cup); }
      for (const dz of [-0.45, 0.45]) { const arm = new THREE.Mesh(G.box, M.darkSteel); arm.scale.set(1.3, 0.04, 0.04); arm.position.set(0, -0.05, dz); bar.add(arm); }
      scene.add(bar);
      this.bars.push(bar);
    }
    // placas de identificación en las coronas
    this.plates.forEach(([x, pi]) => {
      const sign = makeSign(['PRENSA ' + (pi + 1), pi === 0 ? 'Embutido · 2,400 t' : 'Servoprensa · 1,000 t'], 2.6, { w: 768, h: 256, bg: '#e4e7ea', fg: '#1d3557', stripe: '#f2c200' });
      if (this.real) sign.position.set(x + this.off, win.y1 + 0.75, PRESS.z + win.zf + 0.12);
      else sign.position.set(x, 8.35, PRESS.z + 2.42);
      scene.add(sign);
    });
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
    const pos = new THREE.Vector3(p.sx, this.bedY + 0.3, PRESS.z + 1.6);
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
      p.slide.position.x = p.sx + (this.shake && !S.pressStopped ? rand(-1, 1) * this.shake : 0);
    }
    // golpe en punto muerto inferior
    if (!S.pressStopped && this.lastPhase < 0.225 && u >= 0.225) this.audio?.thump(new THREE.Vector3(PRESS.xs[2], 1, PRESS.z));
    this.lastPhase = u;
    // transfer de láminas
    const v = press ? 0 : smooth((u - 0.45) / 0.55);
    const lift = press ? 0 : Math.sin(Math.PI * (u - 0.45) / 0.55);
    const xs = [PRESS.xs[0] - 9, ...PRESS.xs.map((x) => x + this.off), PRESS.xs[n - 1] + 7.5];
    const bed = this.bedY + (this.real ? 0.22 : 0.15), hop = this.real ? 0.6 : 0.9;
    for (let i = 0; i <= n; i++) {
      const s = this.sheets[i];
      const a = xs[i], b = xs[i + 1];
      const moving = !(press || S.pressStopped);
      const x = moving ? a + (b - a) * v : a;
      const ya = i === 0 ? 1.0 : bed, yb = i === n ? 1.0 : bed;
      s.position.set(x, (moving ? ya + (yb - ya) * v : ya) + hop * lift * (S.pressStopped ? 0 : 1), PRESS.z);
      s.scale.y = i === 0 ? 0.03 : 0.16;
      if (S.pressStopped && i === 3) { s.rotation.z = 0.5; s.position.y = bed + 0.35; }
      else s.rotation.z = 0;
      const bar = this.bars[i];
      bar.position.set(s.position.x, Math.max(s.position.y + 0.2, this.real ? bed + 0.35 : 1.75), PRESS.z);
      bar.visible = !(S.pressStopped && i === 3) && !(this.real && press);
    }
    if (S.pressStopped && this.crashPos && Math.random() < dt * 6) {
      this.fx.smoke.emit(this.crashPos, 0x3a3a3a, 1.6, 6, 0.9);
      if (Math.random() < 0.3) this.fx.sparks.emit(this.crashPos, 12, new THREE.Color(1, 0.6, 0.2), 3, 1, null, 0.6);
    }
  }
}
