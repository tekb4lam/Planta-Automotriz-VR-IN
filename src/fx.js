import * as THREE from 'three';
import { dotTexture, smokeTexture, makeCanvas, canvasTex, FONT, warnIcon, rand } from './util.js';

// ---------- Additive particle system (chispas, niebla de pintura) ----------
export class Particles {
  constructor(scene, max, opts = {}) {
    this.max = max;
    this.gravity = opts.gravity ?? -9.8;
    this.drag = opts.drag ?? 0.2;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size: opts.size ?? 0.05, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
  }
  emit(p, n, color, speed = 3, spread = 1, dir = null, life = 0.6) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      let vx = rand(-1, 1) * spread, vy = rand(-0.2, 1) * spread, vz = rand(-1, 1) * spread;
      if (dir) { vx += dir.x; vy += dir.y; vz += dir.z; }
      this.vel[i * 3] = vx * speed; this.vel[i * 3 + 1] = vy * speed; this.vel[i * 3 + 2] = vz * speed;
      this.life[i] = this.maxLife[i] = life * rand(0.6, 1.3);
      this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b;
    }
  }
  update(dt) {
    const d = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1000; continue; }
      this.vel[i * 3 + 1] += this.gravity * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] *= d; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01 && this.gravity < 0) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.3; }
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] = this.base[i * 3] * f; this.col[i * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -1000; }
}

// ---------- Humo (sprites con opacidad individual) ----------
export class Smoke {
  constructor(scene, max = 70) {
    this.tex = smokeTexture();
    this.items = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex, color: 0x555555, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.items.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
    }
    this.next = 0;
  }
  emit(p, color = 0x444444, size = 1.5, life = 5, rise = 0.8) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    it.s.position.copy(p).add(new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)));
    it.s.material.color.setHex(color);
    it.s.scale.setScalar(size);
    it.size = size; it.life = it.max = life; it.vel.set(rand(-0.2, 0.2), rise * rand(0.7, 1.3), rand(-0.2, 0.2));
    it.s.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.s.visible = false; continue; }
      const f = it.life / it.max;
      it.s.position.addScaledVector(it.vel, dt);
      it.s.scale.setScalar(it.size * (1 + (1 - f) * 2.5));
      it.s.material.opacity = Math.min(1, (1 - f) * 4) * f * 0.85;
    }
  }
  clear() { for (const it of this.items) { it.life = 0; it.s.visible = false; } }
}

// ---------- Marcadores de impacto (columna roja + etiqueta) ----------
function labelTexture(text, color) {
  const c = makeCanvas(512, 128), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15,0,0,0.85)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 120);
  warnIcon(ctx, 62, 64, 76, color);
  ctx.fillStyle = '#fff'; ctx.font = `700 34px ${FONT}`; ctx.textBaseline = 'middle';
  const words = text.split(' ');
  let l1 = '', l2 = '';
  for (const w of words) { if (ctx.measureText(l1 + ' ' + w).width < 380 && !l2) l1 = (l1 ? l1 + ' ' : '') + w; else l2 = (l2 ? l2 + ' ' : '') + w; }
  if (l2) { ctx.fillText(l1, 112, 42); ctx.fillText(l2, 112, 86); } else ctx.fillText(l1, 112, 64);
  return canvasTex(c);
}
export class Markers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 7, 20, 1, true);
    this.ringGeo = new THREE.RingGeometry(0.9, 1.15, 32);
  }
  add(pos, text, color = '#ff3030', opts = {}) {
    const g = new THREE.Group();
    g.position.copy(pos); g.position.y = opts.y ?? 0;
    const c = new THREE.Color(color);
    const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = opts.short ? 1.6 : 3.5;
    const s = opts.scale ?? 1;
    beam.scale.set(s, opts.short ? 0.45 : 1, s);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.scale.setScalar(s);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), depthTest: false, transparent: true, toneMapped: false }));
    sp.scale.set(2.6, 0.65, 1);
    sp.position.y = opts.labelY ?? 4.2;
    sp.renderOrder = 10;
    g.add(beam, ring, sp);
    this.scene.add(g);
    const m = { g, beam, ring, sp, t: Math.random() * 6, follow: opts.follow || null };
    this.list.push(m);
    return m;
  }
  remove(m) { m.dead = true; }
  update(dt) {
    if (this.list.some((m) => m.dead)) {
      this.list = this.list.filter((m) => {
        if (!m.dead) return true;
        this.scene.remove(m.g); m.sp.material.map.dispose(); m.sp.material.dispose(); m.beam.material.dispose(); m.ring.material.dispose();
        return false;
      });
    }
    for (const m of this.list) {
      m.t += dt;
      const p = 0.5 + 0.5 * Math.sin(m.t * 5);
      m.beam.material.opacity = 0.12 + 0.2 * p;
      m.ring.scale.setScalar((m.beam.scale.x) * (1 + 0.25 * p));
      if (m.follow) { m.g.position.x = m.follow.position.x; m.g.position.z = m.follow.position.z; }
    }
  }
  clear() {
    for (const m of this.list) {
      this.scene.remove(m.g);
      m.sp.material.map.dispose(); m.sp.material.dispose(); m.beam.material.dispose(); m.ring.material.dispose();
    }
    this.list = [];
  }
}

// ---------- Balizas de emergencia giratorias ----------
export class Beacons {
  constructor(scene, positions) {
    this.items = [];
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const coneGeo = new THREE.ConeGeometry(1.6, 9, 16, 1, true);
    coneGeo.translate(0, -4.5, 0);
    coneGeo.rotateZ(Math.PI / 2.4);
    for (const p of positions) {
      const g = new THREE.Group(); g.position.copy(p);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 12), bodyMat);
      const rot = new THREE.Group();
      const beam = new THREE.Mesh(coneGeo, beamMat);
      rot.add(beam);
      g.add(body, rot);
      g.visible = false;
      scene.add(g);
      this.items.push({ g, rot });
    }
    this.on = false;
  }
  set(on) { this.on = on; this.items.forEach((i) => (i.g.visible = on)); }
  update(dt) { if (!this.on) return; this.items.forEach((i, k) => (i.rot.rotation.y += dt * (5 + (k % 3)))); }
}

// ---------- Destellos de soldadura ----------
export class Flashes {
  constructor(scene, max = 24) {
    this.items = [];
    const tex = dotTexture();
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xcfe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false; scene.add(s);
      this.items.push({ s, life: 0 });
    }
    this.next = 0;
  }
  emit(p) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    it.s.position.copy(p); it.life = 0.09; it.s.visible = true; it.s.scale.setScalar(rand(0.5, 0.9));
  }
  update(dt) { for (const it of this.items) if (it.life > 0) { it.life -= dt; if (it.life <= 0) it.s.visible = false; } }
}

// ---------- Escudo de bloqueo (defensa) ----------
export class Shields {
  constructor(scene) { this.scene = scene; this.list = []; this.geo = new THREE.IcosahedronGeometry(1, 2); }
  flash(pos, color = 0x33ff88) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(pos); m.scale.setScalar(0.3);
    this.scene.add(m);
    this.list.push({ m, t: 0 });
  }
  update(dt) {
    this.list = this.list.filter((s) => {
      s.t += dt;
      s.m.scale.setScalar(0.3 + s.t * 2.2);
      s.m.material.opacity = Math.max(0, 0.9 - s.t * 0.9);
      s.m.rotation.y += dt;
      if (s.t > 1) { this.scene.remove(s.m); s.m.material.dispose(); return false; }
      return true;
    });
  }
}
