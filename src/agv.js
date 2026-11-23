import * as THREE from 'three';
import { AGVP, WALK } from './config.js';
import { M, P, mergeColored, rand, emissiveMat } from './util.js';
import { S } from './state.js';
import { machine } from './assets.js';

const LOOP = [[AGVP.x0, AGVP.zE], [AGVP.x1, AGVP.zE], [AGVP.x1, AGVP.zW], [AGVP.x0, AGVP.zW]];
const SEG = LOOP.map((p, i) => { const q = LOOP[(i + 1) % 4]; return { a: p, b: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
const L = SEG.reduce((s, g) => s + g.len, 0);
const STATIONS = [-25, 25, 72, 88].map((x) => x - AGVP.x0);

function posAt(d) {
  d = ((d % L) + L) % L;
  for (const s of SEG) {
    if (d <= s.len) { const t = d / s.len; return { x: s.a[0] + (s.b[0] - s.a[0]) * t, z: s.a[1] + (s.b[1] - s.a[1]) * t, dx: (s.b[0] - s.a[0]) / s.len, dz: (s.b[1] - s.a[1]) / s.len }; }
    d -= s.len;
  }
  return { x: LOOP[0][0], z: LOOP[0][1], dx: 1, dz: 0 };
}
const angDamp = (a, b, k, dt) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-k * dt)); };

let GEO;
function agvGeo() {
  if (GEO) return GEO;
  const o = 0xf28c1a, k = 0x1a1a1a, b = 0x2266cc, s = 0x8a9299;
  GEO = mergeColored([
    [P.box(1.7, 0.32, 1.0, 0, 0.24, 0), o], [P.box(0.08, 0.2, 1.02, 0.88, 0.2, 0), k], [P.box(0.08, 0.2, 1.02, -0.88, 0.2, 0), k],
    [P.cyl(0.08, 0.1, 0.7, 0.45, 0), k], [P.box(1.72, 0.04, 1.02, 0, 0.41, 0), k],
    ...[[0.7, 0.42], [-0.7, 0.42], [0.7, -0.42], [-0.7, -0.42]].map(([x, z]) => [P.box(0.05, 1.5, 0.05, x * 0.85, 1.15, z), s]),
    [P.box(1.3, 0.04, 0.85, 0, 0.9, 0), s], [P.box(1.3, 0.04, 0.85, 0, 1.6, 0), s],
    [P.box(0.4, 0.3, 0.6, -0.4, 1.08, 0), b], [P.box(0.4, 0.3, 0.6, 0.15, 1.08, 0), b], [P.box(0.4, 0.3, 0.6, -0.2, 1.78, 0), b], [P.box(0.4, 0.3, 0.6, 0.35, 1.78, 0), 0xc49a64],
  ]);
  return GEO;
}

export class AGVFleet {
  constructor(scene, fx) {
    this.fx = fx;
    this.list = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const lm = emissiveMat(0x22ff55, 2.5);
      const real = machine('agv', { length: 3.2 });
      if (real) {
        // tractor AGV + carro de Meshy (su frente es -x: se gira para avanzar hacia +x)
        real.rotation.y = Math.PI; g.add(real);
        const t = real.userData.toW(-0.7, 0.26, 0);
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.28), lm); light.position.set(-t.x, t.y + 0.03, 0); g.add(light);
      } else {
        g.add(new THREE.Mesh(agvGeo(), M.vc));
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.04), lm); light.position.y = 0.43; g.add(light);
      }
      scene.add(g);
      this.list.push({ g, lm, d: (L / 6) * i + 5, wait: 0, hijack: false, crashed: false, target: new THREE.Vector3(), inWalk: false, heading: 0 });
    }
    this.reset();
  }
  reset() {
    this.list.forEach((a, i) => { a.d = (L / 6) * i + 5; a.wait = 0; a.hijack = false; a.crashed = false; a.inWalk = false; a.lm.emissive.setHex(0x22ff55); const p = posAt(a.d); a.g.position.set(p.x, 0, p.z); a.heading = Math.atan2(-p.dz, p.dx); a.g.rotation.y = a.heading; });
  }
  hijackAll() {
    this.list.forEach((a, i) => { a.hijack = true; this.newTarget(a, i % 2 === 0); });
  }
  newTarget(a, walk) {
    if (walk) a.target.set(a.g.position.x + rand(-25, 25), 0, rand(WALK.z0 + 0.5, WALK.z1 - 0.5));
    else a.target.set(rand(AGVP.x0, AGVP.x1), 0, rand(WALK.z0, 23));
    a.target.x = Math.max(AGVP.x0 - 10, Math.min(AGVP.x1 + 10, a.target.x));
  }
  update(dt, t) {
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (a.crashed) { a.lm.emissive.setHex(Math.sin(t * 10) > 0 ? 0xff2020 : 0x220000); continue; }
      if (!a.hijack) {
        if (a.wait > 0) a.wait -= dt;
        else {
          const prev = ((a.d % L) + L) % L;
          a.d += 1.4 * dt;
          const now = ((a.d % L) + L) % L;
          for (const st of STATIONS) if (prev < st && now >= st) a.wait = 3;
        }
        const p = posAt(a.d);
        a.g.position.set(p.x, 0, p.z);
        a.heading = angDamp(a.heading, Math.atan2(-p.dz, p.dx), 6, dt);
        a.lm.emissive.setHex(a.wait > 0 ? 0x2288ff : 0x22ff55);
      } else {
        const dx = a.target.x - a.g.position.x, dz = a.target.z - a.g.position.z, dist = Math.hypot(dx, dz);
        if (dist < 0.6) this.newTarget(a, Math.random() < 0.5);
        else {
          a.heading = angDamp(a.heading, Math.atan2(-dz, dx), 3, dt);
          const v = 2.6;
          a.g.position.x += Math.cos(a.heading) * v * dt;
          a.g.position.z -= Math.sin(a.heading) * v * dt;
        }
        a.lm.emissive.setHex(Math.sin(t * 12) > 0 ? 0xff2020 : 0xffaa00);
        const z = a.g.position.z;
        if (!a.inWalk && z > WALK.z0 && z < WALK.z1) {
          a.inWalk = true;
          S.kpi.safety++;
          this.fx.markers.add(a.g.position, 'AGV invade pasillo peatonal', '#ffb020', { follow: a.g, scale: 1.2, labelY: 3.2 });
        }
        for (let j = 0; j < this.list.length; j++) {
          if (j === i) continue;
          const b = this.list[j];
          if (b.crashed && !b.hijack) continue;
          if (a.g.position.distanceTo(b.g.position) < 1.7) {
            a.crashed = true; b.crashed = true;
            S.kpi.safety++;
            const mid = a.g.position.clone().add(b.g.position).multiplyScalar(0.5); mid.y = 0.6;
            this.fx.sparks.emit(mid, 120, new THREE.Color(1, 0.7, 0.3), 4, 1, null, 0.8);
            this.fx.markers.add(mid, 'Colisión de AGVs', '#ff3030', { scale: 1.3 });
            this.fx.audio?.crash(mid);
            break;
          }
        }
      }
      a.g.rotation.y = a.heading;
    }
  }
}
