import * as THREE from 'three';
import { makeCanvas, canvasTex, FONT, roundRect } from './util.js';
import { ROOMS } from './config.js';
import { S } from './state.js';

const H = 8.2, RH = 3.25;
const inRect = (p, r) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
const inRoom = (p) => inRect(p, ROOMS.office) || inRect(p, ROOMS.control);
const sameRoom = (a, b) => (inRect(a, ROOMS.office) && inRect(b, ROOMS.office)) || (inRect(a, ROOMS.control) && inRect(b, ROOMS.control));
export const NODE_INFO = {
  laptop: ['Estación de usuario', 'Nivel 4 · IT', '#4cc9f0'],
  itsrv: ['Servidores corporativos', 'Nivel 4-5 · IT', '#4cc9f0'],
  fw: ['Firewall IT/OT', 'Nivel 3.5 · DMZ', '#ffd166'],
  scada: ['Servidores SCADA / MES', 'Nivel 3 · Operaciones', '#52b788'],
  hmi: ['Estaciones HMI', 'Nivel 2 · Supervisión', '#52b788'],
  agvsrv: ['Servidor de flota AGV', 'Nivel 3', '#52b788'],
  ap: ['Access Point Wi-Fi industrial', 'Nivel 2', '#b388ff'],
  plc_press: ['PLC Prensas', 'Nivel 1 · Control', '#ff9f1c'],
  plc_biw: ['PLC/Robots Carrocería', 'Nivel 1 · Control', '#ff9f1c'],
  plc_paint: ['PLC Pintura', 'Nivel 1 · Control', '#ff9f1c'],
  plc_oven: ['PLC Horno', 'Nivel 1 · Control', '#ff9f1c'],
  plc_asm: ['PLC Ensamble', 'Nivel 1 · Control', '#ff9f1c'],
  plc_qc: ['PLC Calidad', 'Nivel 1 · Control', '#ff9f1c'],
};
const LINKS = [['laptop', 'itsrv'], ['itsrv', 'fw'], ['fw', 'scada'], ['scada', 'hmi'], ['scada', 'agvsrv'], ['agvsrv', 'ap'],
  ['scada', 'plc_press'], ['scada', 'plc_biw'], ['scada', 'plc_paint'], ['scada', 'plc_oven'], ['scada', 'plc_asm'], ['scada', 'plc_qc']];
const WIFI = new Set(['rogue>ap', 'ap>rogue']);

function nodeLabel(id) {
  const [name, lvl, col] = NODE_INFO[id];
  const c = makeCanvas(512, 150), ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(8,18,28,0.88)'; roundRect(ctx, 4, 4, 504, 142, 18); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 6; roundRect(ctx, 4, 4, 504, 142, 18); ctx.stroke();
  ctx.fillStyle = col; ctx.font = `800 36px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(lvl, 256, 48);
  ctx.fillStyle = '#fff'; ctx.font = `600 36px ${FONT}`; ctx.fillText(name, 256, 104, 480);
  return canvasTex(c);
}

export class Network {
  constructor(scene, nodes, fx) {
    this.scene = scene; this.nodes = nodes; this.fx = fx;
    this.max = 400;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.max);
    this.mesh.frustumCulled = false;
    this.col = new THREE.Color();
    for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, this.col.set(0xffffff));
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.packets = [];
    this.streams = [];
    this.attackLines = [];
    // capa de red (modelo Purdue)
    this.overlay = new THREE.Group();
    this.overlay.visible = false;
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    for (const [a, b] of LINKS) {
      const g = new THREE.BufferGeometry().setFromPoints(this.path([a, b]));
      this.overlay.add(new THREE.Line(g, lineMat));
    }
    for (const id in NODE_INFO) {
      const p = nodes[id]; if (!p) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nodeLabel(id), transparent: true, depthTest: false, toneMapped: false }));
      sp.scale.set(2.4, 0.7, 1);
      sp.position.set(p.x, p.y + 1.2, p.z);
      sp.renderOrder = 9;
      this.overlay.add(sp);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: NODE_INFO[id][2], toneMapped: false }));
      dot.position.copy(p); this.overlay.add(dot);
    }
    scene.add(this.overlay);
    this.bgT = 0;
  }
  // canaleta: dentro de cuartos va bajo el plafón (3.2 m) y sale por el muro este
  riser(P) {
    if (inRoom(P)) return [P.clone(), new THREE.Vector3(P.x, RH, P.z), new THREE.Vector3(-103.2, RH, P.z), new THREE.Vector3(-103.2, H, P.z)];
    return [P.clone(), new THREE.Vector3(P.x, H, P.z)];
  }
  seg(a, b) {
    const A = this.nodes[a], Bn = this.nodes[b];
    if (WIFI.has(a + '>' + b)) return [A.clone(), Bn.clone()];
    if (inRoom(A) && inRoom(Bn) && sameRoom(A, Bn)) return [A.clone(), new THREE.Vector3(A.x, RH, A.z), new THREE.Vector3(Bn.x, RH, A.z), new THREE.Vector3(Bn.x, RH, Bn.z), Bn.clone()];
    const ra = this.riser(A), rb = this.riser(Bn).reverse();
    const ta = ra[ra.length - 1], tb = rb[0];
    return [...ra, new THREE.Vector3(tb.x, H, ta.z), ...rb];
  }
  path(route) {
    const pts = [];
    for (let i = 0; i < route.length - 1; i++) {
      const s = this.seg(route[i], route[i + 1]);
      if (pts.length) s.shift();
      pts.push(...s);
    }
    return pts;
  }
  // stream de paquetes; blockAt: id de nodo donde se bloquea (defensa) o null
  stream(route, color, opts = {}) {
    let r = route;
    const blockIdx = opts.blockAt ? route.indexOf(opts.blockAt) : -1;
    if (blockIdx >= 0) r = route.slice(0, blockIdx + 1);
    const pts = this.path(r);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const st = { pts, cum, len: cum[cum.length - 1], color: new THREE.Color(color), rate: opts.rate ?? 6, speed: opts.speed ?? 18, timer: 0, active: true, blocked: blockIdx >= 0, endNode: r[r.length - 1], onArrive: opts.onArrive, arrivedOnce: false, bg: !!opts.bg, life: opts.life ?? Infinity };
    if (opts.line !== false && !opts.bg) {
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const lm = new THREE.LineBasicMaterial({ color: st.blocked ? 0x33ff88 : color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
      st.line = new THREE.Line(lg, lm);
      this.scene.add(st.line);
    }
    this.streams.push(st);
    return st;
  }
  stop(st) { st.active = false; if (st.line) { this.scene.remove(st.line); st.line.geometry.dispose(); st.line = null; } }
  clear() { this.streams.forEach((s) => this.stop(s)); this.streams = []; this.packets = []; this.mesh.count = 0; S.compromised.clear(); }
  update(dt) {
    this.overlay.visible = S.showNetwork;
    // tráfico normal de fondo
    if (S.showNetwork) {
      this.bgT -= dt;
      if (this.bgT <= 0) {
        this.bgT = 0.35;
        const plcs = ['plc_press', 'plc_biw', 'plc_paint', 'plc_oven', 'plc_asm', 'plc_qc'];
        const p = plcs[(Math.random() * plcs.length) | 0];
        const r = Math.random() < 0.5 ? ['scada', p] : [p, 'scada'];
        if (Math.random() < 0.25) r.splice(0, 2, 'hmi', 'scada');
        this.spawn(this.makeTmpStream(r, 0x38e1ff));
      }
    }
    for (const st of this.streams) {
      if (!st.active) continue;
      st.life -= dt;
      if (st.life <= 0) { this.stop(st); continue; }
      st.timer -= dt;
      if (st.timer <= 0) { st.timer = 1 / st.rate; this.spawn(st); }
    }
    this.streams = this.streams.filter((s) => s.active || this.packets.some((p) => p.st === s));
    // mover paquetes
    const dummy = this._d || (this._d = new THREE.Object3D());
    let n = 0;
    this.packets = this.packets.filter((p) => {
      p.d += p.st.speed * dt;
      if (p.d >= p.st.len) {
        if (!p.st.bg) {
          const end = p.st.pts[p.st.pts.length - 1];
          if (p.st.blocked) { if (Math.random() < 0.5) this.fx.shields.flash(end); }
          else if (!p.st.arrivedOnce) { p.st.arrivedOnce = true; p.st.onArrive?.(); }
        }
        return false;
      }
      return true;
    });
    for (const p of this.packets) {
      if (n >= this.max) break;
      const st = p.st;
      let i = 1; while (i < st.cum.length - 1 && st.cum[i] < p.d) i++;
      const t = (p.d - st.cum[i - 1]) / Math.max(1e-6, st.cum[i] - st.cum[i - 1]);
      dummy.position.lerpVectors(st.pts[i - 1], st.pts[i], t);
      dummy.scale.setScalar(st.bg ? 0.6 : 1.0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, st.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  makeTmpStream(route, color) {
    const pts = this.path(route), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, cum, len: cum[cum.length - 1], color: new THREE.Color(color), speed: 14, bg: true, active: false };
  }
  spawn(st) { if (this.packets.length < this.max) this.packets.push({ st, d: 0 }); }
}
