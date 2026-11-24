import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { B, PLATFORM, ROOMS } from './config.js';
import { S } from './state.js';
import { clamp } from './util.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Player {
  constructor(renderer, scene, camera, hud, actions) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.hud = hud; this.actions = actions;
    this.dolly = new THREE.Group();
    this.dolly.add(camera);
    camera.position.set(0, 1.65, 0);
    scene.add(this.dolly);
    this.pitch = 0;
    this.keys = {};
    this.ray = new THREE.Raycaster();
    this.tabletVisible = true;
    this.snapReady = true;
    this.aiming = false;
    this.prevBtn = {};
    this.setupControllers();
    this.setupTeleport();
    this.setupDesktop();
    S.player = new THREE.Vector3();
  }

  // ---------------- Controladores XR ----------------
  setupControllers() {
    const r = this.renderer;
    this.ctrl = [];
    this.ctrlFactory = new XRControllerModelFactory();
    this.ctrlFactory.setPath('./assets/xr-profiles');
    for (let i = 0; i < 2; i++) {
      const c = r.xr.getController(i), g = r.xr.getControllerGrip(i);
      this.dolly.add(c); this.dolly.add(g);
      const info = { c, g, hand: null, src: null };
      // modelo real del control según el perfil WebXR del dispositivo (Quest 3 → meta-quest-touch-plus),
      // con botones, gatillos y joystick animados; se sirve desde assets/xr-profiles (sin depender de la CDN)
      info.model = this.ctrlFactory.createControllerModel(g);
      g.add(info.model);
      c.addEventListener('connected', (e) => { info.src = e.data; info.hand = e.data.handedness; this.attach(info); });
      c.addEventListener('disconnected', () => { info.src = null; info.hand = null; this.detach(info); });
      c.addEventListener('selectstart', () => this.onSelect(info));
      this.ctrl.push(info);
    }
    // modelo simple de respaldo (solo se ve si no carga el modelo del perfil)
    this.ctrlGeo = new THREE.Group(); this.ctrlGeo.name = 'ctrl-fallback';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.11, 12), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.5 }));
    body.rotation.x = Math.PI / 2 - 0.5; body.position.set(0, -0.015, 0.04);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x38e1ff, emissive: 0x0a4a55, roughness: 0.4 }));
    ring.position.set(0, 0.01, -0.01); ring.rotation.x = 0.4;
    this.ctrlGeo.add(body, ring);
    // láser
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.85 }));
    this.laser.scale.z = 4;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.dot.visible = false;
    this.scene.add(this.dot);
  }
  attach(info) {
    info.fb = this.ctrlGeo.clone(); info.g.add(info.fb);
    if (info.hand === 'right') info.c.add(this.laser);
    if (info.hand === 'left') {
      const m = this.hud.tablet.mesh;
      m.position.set(0, 0.1, -0.06); m.rotation.set(-Math.PI / 3.2, 0, 0);
      info.g.add(m);
      m.visible = this.tabletVisible;
    }
  }
  detach(info) {
    for (const ch of [...info.g.children]) if (ch !== info.model) info.g.remove(ch);
    info.fb = null;
    if (info.hand === 'right') info.c.remove(this.laser);
  }
  get right() { return this.ctrl.find((c) => c.hand === 'right' && c.src); }
  get left() { return this.ctrl.find((c) => c.hand === 'left' && c.src); }
  onSelect(info) {
    if (info.hand !== 'right') return;
    this.rayFrom(info.c);
    const hit = this.tabletVisible && this.left ? this.ray.intersectObject(this.hud.tablet.mesh, false)[0] : null;
    if (hit && hit.uv) this.hud.pointer(hit.uv.x, hit.uv.y, true);
  }
  rayFrom(obj) {
    obj.updateMatrixWorld();
    _m.identity().extractRotation(obj.matrixWorld);
    _o.setFromMatrixPosition(obj.matrixWorld);
    _d.set(0, 0, -1).applyMatrix4(_m).normalize();
    this.ray.set(_o, _d);
  }

  // ---------------- Teletransporte ----------------
  setupTeleport() {
    this.arcN = 40;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.arcN * 3), 3));
    this.arc = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x38e1ff }));
    this.arc.frustumCulled = false; this.arc.visible = false;
    this.scene.add(this.arc);
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0x38e1ff, side: THREE.DoubleSide }));
    this.target.rotation.x = -Math.PI / 2; this.target.visible = false;
    this.scene.add(this.target);
    this.tpPoint = new THREE.Vector3();
    this.tpValid = false;
  }
  computeArc(c) {
    this.rayFrom(c);
    const pos = this.arc.geometry.attributes.position;
    const v = _d.clone().multiplyScalar(9), g = -9.8, o = _o.clone();
    let hit = null, n = 0;
    const p = new THREE.Vector3(), prev = o.clone();
    for (let i = 0; i < this.arcN; i++) {
      const t = i * 0.045;
      p.set(o.x + v.x * t, o.y + v.y * t + 0.5 * g * t * t, o.z + v.z * t);
      if (!hit && i > 0) {
        const P = PLATFORM;
        if (prev.y >= P.y && p.y < P.y) { const k = (prev.y - P.y) / (prev.y - p.y); const q = prev.clone().lerp(p, k); if (q.x > P.x0 && q.x < P.x1 && q.z > P.z0 && q.z < P.z1) { hit = q; } }
        if (!hit && prev.y >= 0 && p.y < 0) { const k = prev.y / (prev.y - p.y); hit = prev.clone().lerp(p, k); hit.y = 0; }
        if (hit) p.copy(hit);
      }
      pos.setXYZ(i, p.x, p.y, p.z); n = i + 1;
      if (hit) { for (let j = i + 1; j < this.arcN; j++) pos.setXYZ(j, p.x, p.y, p.z); break; }
      prev.copy(p);
    }
    pos.needsUpdate = true;
    this.tpValid = !!hit && hit.x > B.x0 + 0.5 && hit.x < B.x1 - 0.5 && hit.z > B.z0 + 0.5 && hit.z < B.z1 - 0.5;
    if (hit) this.tpPoint.copy(hit);
    const col = this.tpValid ? 0x38e1ff : 0xff4040;
    this.arc.material.color.setHex(col); this.target.material.color.setHex(col);
    this.target.visible = !!hit; if (hit) this.target.position.set(hit.x, hit.y + 0.02, hit.z);
  }
  teleportTo(x, y, z, yaw, pitch = 0) {
    // mueve el rig para que la cabeza quede sobre el punto destino
    const head = this.camera.getWorldPosition(_o);
    if (this.renderer.xr.isPresenting) {
      this.dolly.position.x += x - head.x; this.dolly.position.z += z - head.z;
    } else { this.dolly.position.x = x; this.dolly.position.z = z; }
    this.dolly.position.y = y;
    if (yaw !== undefined) this.setYaw(yaw);
    if (!this.renderer.xr.isPresenting) this.pitch = pitch;
    this.hud.toastInit = false;
  }
  setYaw(yaw) {
    if (this.renderer.xr.isPresenting) {
      // girar alrededor de la cabeza
      const head = this.camera.getWorldPosition(new THREE.Vector3());
      const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(_q), 'YXZ');
      this.rotateAround(head, yaw - e.y);
    } else { this.dolly.rotation.y = yaw; this.pitch = 0; }
  }
  rotateAround(p, a) {
    const d = this.dolly;
    const off = d.position.clone().sub(p);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    d.position.copy(p).add(off); d.position.y = this.dolly.position.y;
    d.rotation.y += a;
  }

  // ---------------- Escritorio ----------------
  setupDesktop() {
    const el = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 6) this.actions.startN(n); }
      if (e.code === 'KeyR') this.actions.reset();
      if (e.code === 'KeyN') { S.showNetwork = !S.showNetwork; S.ui.dirty = true; }
      if (e.code === 'KeyF') { S.defenses = !S.defenses; S.ui.dirty = true; }
      if (e.code === 'KeyT') this.actions.toggleDom();
      if (e.code === 'KeyV') this.actions.nextLocation();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    let drag = false, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; this.actions.audioInit(); });
    addEventListener('pointerup', () => (drag = false));
    addEventListener('pointermove', (e) => {
      if (!drag || this.renderer.xr.isPresenting) return;
      this.dolly.rotation.y -= (e.clientX - lx) * 0.004;
      this.pitch = clamp(this.pitch - (e.clientY - ly) * 0.004, -1.3, 1.3);
      lx = e.clientX; ly = e.clientY;
    });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  // ---------------- Bucle ----------------
  update(dt) {
    for (const i of this.ctrl) if (i.fb && i.model.children.length) i.fb.visible = false; // ya cargó el control real
    const xr = this.renderer.xr.isPresenting;
    const head = this.camera.getWorldPosition(_o).clone();
    S.player.copy(head);
    if (!xr) {
      this.camera.position.set(0, 1.65, 0);
      this.camera.rotation.set(this.pitch, 0, 0);
      const k = this.keys, sp = (k.ShiftLeft || k.ShiftRight ? 10 : 4) * dt;
      let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      let s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      if (k.ArrowLeft) this.dolly.rotation.y += 1.6 * dt;
      if (k.ArrowRight) this.dolly.rotation.y -= 1.6 * dt;
      if (k.KeyQ) this.dolly.rotation.y += 1.6 * dt;
      if (k.KeyE) this.dolly.rotation.y -= 1.6 * dt;
      if (f || s) this.move(f * sp, s * sp, this.dolly.rotation.y);
      return;
    }
    // XR
    const R = this.right, L = this.left;
    // locomoción suave (stick izquierdo)
    if (L && L.src.gamepad) {
      const ax = L.src.gamepad.axes, bt = L.src.gamepad.buttons;
      const x = ax[2] || 0, y = ax[3] || 0;
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) {
        const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(_q), 'YXZ');
        const boost = bt[1] && bt[1].pressed ? 2.6 : 1;
        const sp = 2.4 * boost * dt;
        this.move(-y * sp, x * sp, e.y);
      }
      const xPressed = bt[4] && bt[4].pressed;
      if (xPressed && !this.prevBtn.lx) { this.tabletVisible = !this.tabletVisible; this.hud.tablet.mesh.visible = this.tabletVisible; }
      this.prevBtn.lx = xPressed;
      const yPressed = bt[5] && bt[5].pressed;
      if (yPressed && !this.prevBtn.ly) { S.showNetwork = !S.showNetwork; S.ui.dirty = true; }
      this.prevBtn.ly = yPressed;
    }
    if (R && R.src.gamepad) {
      const ax = R.src.gamepad.axes;
      const x = ax[2] || 0, y = ax[3] || 0;
      // giro por pasos
      if (Math.abs(x) > 0.7 && this.snapReady && !this.aiming) { this.snapReady = false; this.rotateAround(this.camera.getWorldPosition(new THREE.Vector3()), x > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(x) < 0.3) this.snapReady = true;
      // teletransporte
      if (y < -0.6) { this.aiming = true; this.arc.visible = true; this.computeArc(R.c); }
      else if (this.aiming && y > -0.3) {
        this.aiming = false; this.arc.visible = false; this.target.visible = false;
        if (this.tpValid) this.teleportTo(this.tpPoint.x, this.tpPoint.y, this.tpPoint.z);
      }
      // apuntador sobre la tablet
      this.rayFrom(R.c);
      const hit = this.tabletVisible && L ? this.ray.intersectObject(this.hud.tablet.mesh, false)[0] : null;
      if (hit && hit.uv) { this.hud.pointer(hit.uv.x, hit.uv.y, false); this.laser.scale.z = hit.distance; this.dot.visible = true; this.dot.position.copy(hit.point); }
      else { if (this.hud.hover) { this.hud.hover = null; S.ui.dirty = true; } this.laser.scale.z = 3; this.dot.visible = false; }
    }
  }
  move(fwd, side, yaw) {
    const d = this.dolly;
    d.position.x += -Math.sin(yaw) * fwd + Math.cos(yaw) * side;
    d.position.z += -Math.cos(yaw) * fwd - Math.sin(yaw) * side;
    if (d.position.y > 1) {
      const P = PLATFORM;
      d.position.x = clamp(d.position.x, P.x0 + 0.4, P.x1 - 0.4); d.position.z = clamp(d.position.z, P.z0 + 0.4, P.z1 - 0.4);
    } else {
      d.position.x = clamp(d.position.x, B.x0 + 0.6, B.x1 - 0.6); d.position.z = clamp(d.position.z, B.z0 + 0.6, B.z1 - 0.6);
    }
  }
}
