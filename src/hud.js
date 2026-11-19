import * as THREE from 'three';
import { BRAND, TITLE, COST_PER_MIN_USD, JPH, LOCATIONS, ZONES } from './config.js';
import { CanvasPanel, FONT, roundRect, wrapText, warnIcon } from './util.js';
import { S, lineRunning } from './state.js';
import { DEFS } from './scenarios.js';
import { NODE_INFO } from './network.js';

const COL = { bg: '#0b1620', panel: '#13222f', panel2: '#1a2e3e', line: '#28445a', text: '#e8f1f8', mute: '#8aa4b8', accent: '#38e1ff', red: '#ff3b3b', amber: '#ffb020', green: '#2ecc71' };
const fmt = (n) => n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
const fmtT = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + x + ' s'; };

export function kpiValues() {
  const k = S.kpi, ts = S.timeScale;
  const down = k.downtime * ts;
  return {
    running: lineRunning(),
    jph: lineRunning() ? JPH : 0,
    down,
    lost: (down / 3600) * JPH,
    cost: (down / 60) * COST_PER_MIN_USD,
    produced: k.produced, defects: k.defects, safety: k.safety,
  };
}

export class HUD {
  constructor(scene, W, actions) {
    this.W = W; this.actions = actions;
    this.tablet = new CanvasPanel(1024, 680, 0.36);
    this.tablet.mat.depthTest = true;
    this.tablet.mesh.renderOrder = 5;
    this.buttons = [];
    this.hover = null;
    this.toast = new CanvasPanel(1024, 300, 1.05, { transparent: true, fog: false });
    this.toast.mat.depthTest = false;
    this.toast.mesh.renderOrder = 20;
    this.toast.mesh.visible = false;
    scene.add(this.toast.mesh);
    this.toastT = 0;
    this.toastData = null;
    this.timer = 0;
    this.dom = null;
    this.lastScreens = '';
    this.drawLaptop('normal');
  }

  // ================= TABLET =================
  btn(id, x, y, w, h, action, draw) { this.buttons.push({ id, x, y, w, h, action }); draw(this.hover === id); }
  drawTablet() {
    const p = this.tablet, ctx = p.ctx, W = p.w, H = p.h;
    this.buttons = [];
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);
    // header
    ctx.fillStyle = COL.panel; ctx.fillRect(0, 0, W, 72);
    ctx.fillStyle = COL.accent; ctx.font = `800 22px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(BRAND.toUpperCase(), 24, 24);
    ctx.fillStyle = COL.text; ctx.font = `700 26px ${FONT}`; ctx.fillText(TITLE, 24, 52, W - 280);
    const run = lineRunning();
    ctx.fillStyle = run ? COL.green : COL.red; roundRect(ctx, W - 236, 16, 216, 42, 21); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 19px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(run ? '● PLANTA OPERANDO' : '● PLANTA DETENIDA', W - 128, 38, 200);
    // tabs
    const tabs = [['riesgos', 'Riesgos'], ['recorrido', 'Recorrido'], ['opciones', 'Opciones']];
    if (S.scenario) tabs.push(['escenario', 'Escenario activo']);
    const tw = (W - 40) / tabs.length;
    tabs.forEach(([id, label], i) => {
      this.btn('tab_' + id, 20 + i * tw, 84, tw - 8, 48, () => { S.ui.tab = id; }, (hov) => {
        const act = S.ui.tab === id;
        ctx.fillStyle = act ? (id === 'escenario' ? '#5a1414' : COL.panel2) : hov ? '#16293a' : COL.panel;
        roundRect(ctx, 20 + i * tw, 84, tw - 8, 48, 10); ctx.fill();
        if (act) { ctx.fillStyle = id === 'escenario' ? COL.red : COL.accent; ctx.fillRect(20 + i * tw + 10, 128, tw - 28, 4); }
        ctx.fillStyle = act ? '#fff' : COL.mute; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(label, 20 + i * tw + (tw - 8) / 2, 109);
      });
    });
    const y0 = 148;
    if (S.ui.tab === 'riesgos') this.tabRisks(ctx, W, H, y0);
    else if (S.ui.tab === 'recorrido') this.tabTour(ctx, W, H, y0);
    else if (S.ui.tab === 'opciones') this.tabOptions(ctx, W, H, y0);
    else if (S.ui.tab === 'escenario' && S.scenario) this.tabScenario(ctx, W, H, y0);
    else { S.ui.tab = 'riesgos'; this.tabRisks(ctx, W, H, y0); }
    p.update();
    if (this.dom) { const d = this.dom.getContext('2d'); d.clearRect(0, 0, this.dom.width, this.dom.height); d.drawImage(p.canvas, 0, 0, this.dom.width, this.dom.height); }
    S.ui.dirty = false;
  }
  tabRisks(ctx, W, H, y0) {
    const bw = (W - 52) / 2, bh = 112;
    DEFS.forEach((d, i) => {
      const x = 20 + (i % 2) * (bw + 12), y = y0 + Math.floor(i / 2) * (bh + 10);
      this.btn('sc_' + d.id, x, y, bw, bh, () => this.actions.start(d.id), (hov) => {
        const act = S.scenario && S.scenario.id === d.id;
        ctx.fillStyle = act ? '#4a1010' : hov ? '#1d3447' : COL.panel; roundRect(ctx, x, y, bw, bh, 14); ctx.fill();
        ctx.strokeStyle = act ? COL.red : hov ? COL.accent : COL.line; ctx.lineWidth = 3; roundRect(ctx, x, y, bw, bh, 14); ctx.stroke();
        ctx.fillStyle = act ? COL.red : '#24394b'; ctx.beginPath(); ctx.arc(x + 44, y + bh / 2, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(d.n), x + 44, y + bh / 2 + 1);
        ctx.textAlign = 'left'; ctx.font = `700 25px ${FONT}`; ctx.fillStyle = '#fff';
        wrapText(ctx, d.title, x + 88, y + 34, bw - 100, 28, 2);
        ctx.font = `500 19px ${FONT}`; ctx.fillStyle = COL.mute; ctx.fillText(d.short, x + 88, y + bh - 22, bw - 100);
      });
    });
    const yb = y0 + 3 * (bh + 10) + 6, bw2 = (W - 52) / 2;
    this.btn('def', 20, yb, bw2, 76, () => { S.defenses = !S.defenses; }, (hov) => {
      ctx.fillStyle = S.defenses ? '#0e4d2c' : hov ? '#1d3447' : COL.panel; roundRect(ctx, 20, yb, bw2, 76, 14); ctx.fill();
      ctx.strokeStyle = S.defenses ? COL.green : COL.line; ctx.lineWidth = 3; roundRect(ctx, 20, yb, bw2, 76, 14); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = `800 25px ${FONT}`; ctx.fillText('Controles de seguridad: ' + (S.defenses ? 'ON' : 'OFF'), 40, yb + 28);
      ctx.font = `500 18px ${FONT}`; ctx.fillStyle = S.defenses ? '#b8f5cf' : COL.mute; ctx.fillText(S.defenses ? 'El próximo ataque será bloqueado por las defensas' : 'Actívalos y repite un ataque para comparar', 40, yb + 56);
    });
    this.btn('reset', 32 + bw2, yb, bw2, 76, () => this.actions.reset(), (hov) => {
      ctx.fillStyle = hov ? '#2b3e4f' : COL.panel2; roundRect(ctx, 32 + bw2, yb, bw2, 76, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 26px ${FONT}`; ctx.fillText('↺ Restablecer planta', 32 + bw2 + bw2 / 2, yb + 39);
    });
  }
  tabTour(ctx, W, H, y0) {
    const cols = 3, bw = (W - 40 - (cols - 1) * 12) / cols, bh = 92;
    LOCATIONS.forEach((l, i) => {
      const x = 20 + (i % cols) * (bw + 12), y = y0 + Math.floor(i / cols) * (bh + 12);
      this.btn('loc_' + l.id, x, y, bw, bh, () => this.actions.go(l), (hov) => {
        ctx.fillStyle = hov ? '#1d3447' : COL.panel; roundRect(ctx, x, y, bw, bh, 14); ctx.fill();
        ctx.strokeStyle = hov ? COL.accent : COL.line; ctx.lineWidth = 3; roundRect(ctx, x, y, bw, bh, 14); ctx.stroke();
        ctx.fillStyle = COL.accent; ctx.font = `800 22px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(String(i + 1).padStart(2, '0'), x + 18, y + 30);
        ctx.fillStyle = '#fff'; ctx.font = `700 27px ${FONT}`; ctx.fillText(l.name, x + 18, y + 64, bw - 30);
      });
    });
    ctx.fillStyle = COL.mute; ctx.font = `500 19px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('Stick izq.: caminar · Stick der. ↑: teletransporte · ←/→: girar · Botón X: mostrar/ocultar tablet', 20, H - 22, W - 40);
  }
  tabOptions(ctx, W, H, y0) {
    const rows = [
      ['net', 'Capa de red OT (modelo Purdue)', S.showNetwork ? 'Visible' : 'Oculta', () => { S.showNetwork = !S.showNetwork; }, S.showNetwork],
      ['def2', 'Controles de seguridad (defensa en profundidad)', S.defenses ? 'ON' : 'OFF', () => { S.defenses = !S.defenses; }, S.defenses],
      ['snd', 'Sonido ambiente y alarmas', S.sound ? 'ON' : 'OFF', () => this.actions.sound(), S.sound],
      ['spd', 'Velocidad de la simulación', '×' + S.simSpeed, () => { S.simSpeed = S.simSpeed === 1 ? 2 : S.simSpeed === 2 ? 4 : 1; }, S.simSpeed > 1],
      ['cst', 'Escala de impacto (costos y unidades)', S.timeScale === 1 ? 'Tiempo real' : '1 s = 1 min', () => { S.timeScale = S.timeScale === 1 ? 60 : 1; }, S.timeScale > 1],
    ];
    rows.forEach(([id, label, val, fn, on], i) => {
      const y = y0 + i * 92;
      this.btn('opt_' + id, 20, y, W - 40, 80, fn, (hov) => {
        ctx.fillStyle = hov ? '#1d3447' : COL.panel; roundRect(ctx, 20, y, W - 40, 80, 14); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(label, 44, y + 41, W - 330);
        ctx.fillStyle = on ? COL.green : '#33485a'; roundRect(ctx, W - 260, y + 16, 216, 48, 24); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `800 23px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(val, W - 152, y + 41);
      });
    });
    ctx.fillStyle = COL.mute; ctx.font = `500 18px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(`Costo de paro supuesto: USD ${fmt(COST_PER_MIN_USD)}/min · Producción nominal ${JPH} unidades/h (editable en el código).`, 20, H - 22, W - 40);
  }
  tabScenario(ctx, W, H, y0) {
    const d = S.scenario, eng = this.actions.engine;
    ctx.fillStyle = COL.red; ctx.font = `800 28px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(`${d.n}. ${d.title}`, 20, y0 + 18, 600);
    // sub tabs
    [['log', 'Cronología'], ['tech', 'ATT&CK y defensa']].forEach(([id, label], i) => {
      const x = 20 + i * 180;
      this.btn('sub_' + id, x, y0 + 40, 170, 40, () => { S.ui.sub = id; }, (hov) => {
        const act = (S.ui.sub || 'log') === id;
        ctx.fillStyle = act ? COL.panel2 : hov ? '#16293a' : COL.bg; roundRect(ctx, x, y0 + 40, 170, 40, 8); ctx.fill();
        ctx.strokeStyle = act ? COL.accent : COL.line; ctx.lineWidth = 2; roundRect(ctx, x, y0 + 40, 170, 40, 8); ctx.stroke();
        ctx.fillStyle = act ? '#fff' : COL.mute; ctx.font = `700 19px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(label, x + 85, y0 + 61);
      });
    });
    const lx = 20, lw = 610, ly = y0 + 96;
    ctx.textAlign = 'left';
    if ((S.ui.sub || 'log') === 'log') {
      let y = ly;
      const log = eng.log;
      const start = Math.max(0, log.length - 5);
      for (let i = start; i < log.length; i++) {
        const e = log[i], c = e.kind === 'block' ? COL.green : e.kind === 'impact' ? COL.red : COL.amber;
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(lx + 12, y + 12, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.mute; ctx.font = `600 16px ${FONT}`; ctx.fillText('T+' + Math.round(e.t) + ' s', lx + 30, y + 6);
        ctx.fillStyle = i === log.length - 1 ? '#fff' : '#b8c7d3'; ctx.font = `${i === log.length - 1 ? 600 : 500} 19px ${FONT}`;
        const n = wrapText(ctx, e.text, lx + 30, y + 28, lw - 40, 22, 4);
        y += 34 + n * 22;
        if (y > H - 60) break;
      }
      if (!log.length) { ctx.fillStyle = COL.mute; ctx.font = `500 20px ${FONT}`; ctx.fillText('Iniciando escenario…', lx, ly + 20); }
      if (eng.blocked) { ctx.fillStyle = COL.green; ctx.font = `800 22px ${FONT}`; ctx.fillText('✔ Ataque contenido por los controles de seguridad', lx, H - 24); }
    } else {
      ctx.fillStyle = COL.accent; ctx.font = `800 20px ${FONT}`; ctx.fillText('MITRE ATT&CK for ICS', lx, ly + 6);
      let y = ly + 22;
      ctx.font = `600 18px ${FONT}`;
      d.techniques.forEach((t) => { ctx.fillStyle = COL.panel2; roundRect(ctx, lx, y, lw - 10, 28, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(t, lx + 10, y + 15, lw - 30); y += 33; });
      ctx.fillStyle = COL.green; ctx.font = `800 20px ${FONT}`; ctx.fillText('Controles que lo habrían evitado', lx, y + 14); y += 30;
      ctx.font = `500 18px ${FONT}`; ctx.fillStyle = '#dff7e9';
      d.mitig.forEach((m) => { y += wrapText(ctx, '• ' + m, lx, y + 10, lw - 10, 21, 2) * 21; });
      ctx.fillStyle = COL.mute; ctx.font = `italic 500 16px ${FONT}`; wrapText(ctx, d.ref, lx, H - 44, lw - 10, 19, 2);
    }
    // KPIs
    const k = kpiValues(), kx = 650, kw = W - kx - 20;
    const tiles = [
      ['Estado', k.running ? 'Operando' : 'DETENIDA', k.running ? COL.green : COL.red],
      ['Tiempo de paro' + (S.timeScale > 1 ? ' (esc.)' : ''), fmtT(k.down), k.down > 0 ? COL.red : COL.text],
      ['Unidades no producidas', fmt(k.lost), k.lost >= 1 ? COL.red : COL.text],
      ['Costo estimado', 'USD ' + fmt(k.cost), k.cost > 0 ? COL.red : COL.text],
      ['Unidades defectuosas', String(k.defects + this.actions.affected()), k.defects + this.actions.affected() ? COL.amber : COL.text],
      ['Incidentes de seguridad', String(k.safety), k.safety ? COL.red : COL.text],
    ];
    tiles.forEach(([l, v, c], i) => {
      const y = y0 + i * 80;
      ctx.fillStyle = COL.panel; roundRect(ctx, kx, y, kw, 72, 12); ctx.fill();
      ctx.fillStyle = COL.mute; ctx.font = `600 17px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(l, kx + 16, y + 20);
      ctx.fillStyle = c; ctx.font = `800 28px ${FONT}`; ctx.fillText(v, kx + 16, y + 52, kw - 30);
    });
    this.btn('reset2', kx, H - 52, kw, 42, () => this.actions.reset(), (hov) => {
      ctx.fillStyle = hov ? '#2b3e4f' : COL.panel2; roundRect(ctx, kx, H - 52, kw, 42, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `800 21px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('↺ Restablecer', kx + kw / 2, H - 30);
    });
  }
  pointer(u, v, click) {
    const x = u * this.tablet.w, y = (1 - v) * this.tablet.h;
    const b = this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    const id = b ? b.id : null;
    if (id !== this.hover) { this.hover = id; S.ui.dirty = true; }
    if (click && b) { b.action(); this.actions.click(); S.ui.dirty = true; }
    return !!b;
  }

  // ================= TOAST (panel narrativo que sigue la vista) =================
  showToast(def, entry) { this.toastData = { def, entry }; this.toastT = 0; this.drawToast(); this.toast.mesh.visible = true; }
  drawToast() {
    const p = this.toast, ctx = p.ctx, d = this.toastData; if (!d) return;
    const c = d.entry.kind === 'block' ? COL.green : d.entry.kind === 'impact' ? COL.red : COL.amber;
    ctx.clearRect(0, 0, p.w, p.h);
    ctx.fillStyle = 'rgba(8,14,20,0.9)'; roundRect(ctx, 6, 6, p.w - 12, p.h - 12, 22); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 6; roundRect(ctx, 6, 6, p.w - 12, p.h - 12, 22); ctx.stroke();
    if (d.entry.kind === 'block') { ctx.fillStyle = COL.green; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✔', 70, 70); }
    else warnIcon(ctx, 70, 70, 74, c);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c; ctx.font = `800 30px ${FONT}`;
    ctx.fillText((d.entry.kind === 'block' ? 'ATAQUE BLOQUEADO · ' : d.entry.kind === 'impact' ? 'IMPACTO · ' : 'ATAQUE EN CURSO · ') + d.def.title.toUpperCase(), 130, 52, p.w - 160);
    ctx.fillStyle = '#fff'; ctx.font = `600 31px ${FONT}`; ctx.textBaseline = 'top';
    wrapText(ctx, d.entry.text, 130, 94, p.w - 160, 38, 5);
    p.update();
  }

  // ================= PANTALLAS DE PLANTA =================
  drawKPI(panel) {
    const ctx = panel.ctx, W = panel.w, H = panel.h, k = kpiValues();
    ctx.fillStyle = '#071019'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = k.running ? '#0f5132' : '#7a1010'; ctx.fillRect(0, 0, W, 86);
    ctx.fillStyle = '#fff'; ctx.font = `800 42px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('TABLERO DE PRODUCCIÓN', 28, 44);
    ctx.textAlign = 'right'; ctx.font = `800 36px ${FONT}`; ctx.fillText(k.running ? 'OPERANDO' : 'PLANTA DETENIDA', W - 28, 44);
    const tiles = [['Producción', k.jph + ' / ' + JPH + ' u/h'], ['Unidades OK (turno)', fmt(k.produced)], ['Tiempo de paro', fmtT(k.down)], ['Unidades no producidas', fmt(k.lost)], ['Costo estimado', 'USD ' + fmt(k.cost)], ['Defectos / Seguridad', (k.defects + this.actions.affected()) + ' / ' + k.safety]];
    tiles.forEach(([l, v], i) => {
      const x = 24 + (i % 3) * 330, y = 106 + Math.floor(i / 3) * 170;
      ctx.fillStyle = '#10202d'; roundRect(ctx, x, y, 316, 154, 14); ctx.fill();
      ctx.fillStyle = '#8aa4b8'; ctx.font = `600 26px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(l, x + 18, y + 34);
      const bad = (i === 2 || i === 3 || i === 4) && k.down > 0 || (i === 5 && (k.defects || k.safety));
      ctx.fillStyle = bad ? '#ff4d4d' : '#ffffff'; ctx.font = `800 44px ${FONT}`; ctx.fillText(v, x + 18, y + 100, 290);
    });
    ctx.fillStyle = S.scenario ? '#ff6b6b' : '#5f7a8e'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(S.scenario ? '⚠ Incidente activo: ' + S.scenario.title : 'Sin incidentes · ' + (S.defenses ? 'Controles de seguridad activos' : 'Controles de seguridad: básicos'), 28, H - 26, W - 56);
    panel.update();
  }
  drawRansom(panel, small = false) {
    const ctx = panel.ctx, W = panel.w, H = panel.h, t = performance.now() / 1000;
    ctx.fillStyle = '#120000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#c40000' : '#8a0000'; ctx.fillRect(0, 0, W, H * 0.2);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${H * 0.09}px ${FONT}`; ctx.fillText('SUS ARCHIVOS HAN SIDO CIFRADOS', W / 2, H * 0.1, W - 40);
    // candado
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = H * 0.025; ctx.beginPath(); ctx.arc(W / 2, H * 0.42, H * 0.09, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(W / 2 - H * 0.13, H * 0.42, H * 0.26, H * 0.2);
    ctx.fillStyle = '#ffdddd'; ctx.font = `600 ${H * 0.05}px ${FONT}`;
    ctx.fillText('SCADA, MES e historiadores no disponibles.', W / 2, H * 0.72, W - 60);
    if (!small) ctx.fillText('Pague en 72 h o los datos de producción serán publicados.', W / 2, H * 0.8, W - 60);
    ctx.fillStyle = '#ff8080'; ctx.font = `500 ${H * 0.035}px ${FONT}`; ctx.fillText('[ Simulación de concientización — ransomware ficticio ]', W / 2, H * 0.92);
    panel.update();
  }
  drawSCADA(panel) {
    if (S.hmi.encrypted) return this.drawRansom(panel);
    const ctx = panel.ctx, W = panel.w, H = panel.h;
    ctx.fillStyle = '#1e2328'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2d343b'; ctx.fillRect(0, 0, W, 64);
    ctx.fillStyle = '#e6e6e6'; ctx.font = `700 30px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('SCADA · Planta de Ensamble — Vista general', 24, 33);
    const now = S.hmi.frozen ? (S.hmi.frozenClock || (S.hmi.frozenClock = new Date().toLocaleTimeString('es-MX'))) : new Date().toLocaleTimeString('es-MX');
    ctx.textAlign = 'right'; ctx.fillText(now, W - 24, 33);
    // diagrama de flujo
    const zones = ['press', 'biw', 'paint', 'oven', 'asm', 'qc'];
    const bw = (W - 60) / zones.length;
    zones.forEach((id, i) => {
      let st = (S.zones[id] || { status: 'ok' }).status;
      if (S.hmi.spoofBiw && id === 'biw') st = 'ok';
      if (S.hmi.spoofOven && id === 'oven') st = 'ok';
      if (S.hmi.frozen) st = 'frozen';
      const c = { ok: '#2e7d32', warn: '#b7860b', stop: '#b71c1c', attack: '#b71c1c', frozen: '#555' }[st];
      const x = 24 + i * bw, y = 96;
      ctx.fillStyle = c; roundRect(ctx, x, y, bw - 16, 120, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(ZONES[id].replace(' (BIW)', ''), x + (bw - 16) / 2, y + 40, bw - 30);
      ctx.font = `600 20px ${FONT}`; ctx.fillText({ ok: 'EN MARCHA', warn: 'ALERTA', stop: 'PARO', attack: 'FALLA', frozen: '???' }[st], x + (bw - 16) / 2, y + 84);
      if (i < zones.length - 1) { ctx.fillStyle = '#9aa'; ctx.beginPath(); ctx.moveTo(x + bw - 14, y + 52); ctx.lineTo(x + bw - 2, y + 60); ctx.lineTo(x + bw - 14, y + 68); ctx.fill(); }
    });
    // valores de proceso
    const fz = S.hmi.frozen;
    const vals = [
      ['Prensas (golpes/min)', fz ? '---' : String(S.pressSpm), S.pressSpm > 20 ? '#ff5252' : '#7CFC9A'],
      ['Horno curado (°C)', fz ? '---' : String(Math.round(S.hmi.spoofOven ? 180 + Math.sin(performance.now() / 900) : S.ovenTemp)), !S.hmi.spoofOven && S.ovenTemp > 200 ? '#ff5252' : '#7CFC9A'],
      ['Robots Carrocería', fz ? '---' : S.hmi.spoofBiw ? '13/13 OK' : this.actions.robotStatus(), '#7CFC9A'],
      ['AGVs en ruta', fz ? '---' : this.actions.agvStatus(), '#7CFC9A'],
      ['Producción (u/h)', fz ? '---' : String(kpiValues().jph), '#7CFC9A'],
    ];
    vals.forEach(([l, v, c], i) => {
      const x = 24 + (i % 3) * ((W - 48) / 3), y = 250 + Math.floor(i / 3) * 130;
      ctx.fillStyle = '#14181c'; roundRect(ctx, x, y, (W - 48) / 3 - 16, 112, 10); ctx.fill();
      ctx.fillStyle = '#9aa7b1'; ctx.font = `600 22px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(l, x + 16, y + 28);
      ctx.fillStyle = fz ? '#777' : c; ctx.font = `800 46px ${FONT}`; ctx.fillText(v, x + 16, y + 78);
    });
    // alarmas
    ctx.fillStyle = '#111'; ctx.fillRect(24, 520, W - 48, 176);
    ctx.fillStyle = '#ddd'; ctx.font = `700 22px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('Alarmas activas', 40, 545);
    const alarms = [];
    for (const id in S.zones) {
      const z = S.zones[id];
      if (z.status === 'ok') continue;
      if ((S.hmi.spoofBiw && id === 'biw') || (S.hmi.spoofOven && id === 'oven')) continue;
      alarms.push([z.status === 'warn' ? '#ffcc00' : '#ff5252', `${ZONES[id]}: ${z.note || z.status}`]);
    }
    if (!alarms.length) alarms.push(['#7CFC9A', 'Sin alarmas — proceso normal']);
    ctx.font = `600 22px ${FONT}`;
    alarms.slice(0, 5).forEach(([c, txt], i) => { ctx.fillStyle = c; ctx.fillText('● ' + txt, 40, 580 + i * 26, W - 90); });
    if (fz) {
      ctx.fillStyle = 'rgba(40,40,40,0.75)'; ctx.fillRect(0, 64, W, H - 64);
      ctx.fillStyle = '#ffcc00'; ctx.font = `900 64px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('SIN COMUNICACIÓN CON PLC', W / 2, H / 2, W - 60);
      ctx.font = `600 30px ${FONT}`; ctx.fillStyle = '#eee'; ctx.fillText('Datos congelados desde ' + now + ' · Tiempo de espera agotado', W / 2, H / 2 + 60);
    }
    panel.update();
  }
  drawNet(panel) {
    if (S.hmi.encrypted) return this.drawRansom(panel, true);
    const ctx = panel.ctx, W = panel.w, H = panel.h;
    ctx.fillStyle = '#0b141c'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16232f'; ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = '#e6eef5'; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Monitoreo de red OT · Modelo Purdue', 20, 31);
    const levels = [['N4-5 IT', ['laptop', 'itsrv']], ['N3.5 DMZ', ['fw']], ['N3 Operación', ['scada', 'agvsrv']], ['N2 Supervisión', ['hmi', 'ap']], ['N1 Control', ['plc_press', 'plc_biw', 'plc_paint', 'plc_oven', 'plc_asm', 'plc_qc']]];
    const pos = {};
    levels.forEach(([name, ids], li) => {
      const y = 100 + li * 104;
      ctx.fillStyle = li % 2 ? '#0f1b25' : '#122230'; ctx.fillRect(0, y - 46, W, 100);
      ctx.fillStyle = '#6f8ba0'; ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(name, 14, y);
      ids.forEach((id, i) => { pos[id] = [210 + (i + 0.5) * ((W - 230) / ids.length), y]; });
    });
    const links = [['laptop', 'itsrv'], ['itsrv', 'fw'], ['fw', 'scada'], ['scada', 'hmi'], ['scada', 'agvsrv'], ['agvsrv', 'ap'], ['scada', 'plc_press'], ['scada', 'plc_biw'], ['scada', 'plc_paint'], ['scada', 'plc_oven'], ['scada', 'plc_asm'], ['scada', 'plc_qc']];
    links.forEach(([a, b]) => {
      const bad = S.compromised.has(a) && S.compromised.has(b);
      ctx.strokeStyle = bad ? '#ff3b3b' : '#2f6f8f'; ctx.lineWidth = bad ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(...pos[a]); ctx.lineTo(...pos[b]); ctx.stroke();
    });
    for (const id in pos) {
      const [x, y] = pos[id], bad = S.compromised.has(id);
      ctx.fillStyle = bad ? '#ff3b3b' : NODE_INFO[id][2]; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = bad ? '#ffb3b3' : '#c9d8e3'; ctx.font = `600 16px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(NODE_INFO[id][0].replace('Servidores ', '').replace('Estación de ', ''), x, y + 32, 160);
    }
    ctx.fillStyle = S.defenses ? '#2ecc71' : '#ff9f43'; ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(S.defenses ? 'Segmentación · NAC · DPI · 802.1X · SIS · Storm-control: ACTIVOS' : 'Controles avanzados: NO configurados (red plana)', 20, H - 22, W - 40);
    panel.update();
  }
  drawLaptop(mode) {
    this.laptopMode = mode;
    const p = this.W.screens.laptop, ctx = p.ctx, W = p.w, H = p.h;
    if (mode === 'ransom') return this.drawRansom(p, true);
    ctx.fillStyle = '#f3f5f7'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1f6feb'; ctx.fillRect(0, 0, W, 40);
    ctx.fillStyle = '#fff'; ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('Correo · Bandeja de entrada', 14, 20);
    const mails = [['Compras', 'Factura pendiente de pago — URGENTE'], ['RR.HH.', 'Actualiza tus datos de nómina'], ['TI', 'Mantenimiento programado'], ['Calidad', 'Reporte semanal de auditoría']];
    mails.forEach(([f, s], i) => {
      ctx.fillStyle = i === 0 ? '#fff4d6' : '#fff'; ctx.fillRect(10, 50 + i * 62, W - 20, 56);
      ctx.fillStyle = '#222'; ctx.font = `700 18px ${FONT}`; ctx.fillText(f, 22, 66 + i * 62);
      ctx.fillStyle = '#555'; ctx.font = `500 16px ${FONT}`; ctx.fillText(s, 22, 90 + i * 62, W - 40);
    });
    if (mode === 'phish') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; roundRect(ctx, 50, 70, W - 100, 190, 10); ctx.fill();
      ctx.fillStyle = '#b00020'; ctx.font = `800 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('Factura_Pendiente.pdf.exe', W / 2, 108);
      ctx.fillStyle = '#333'; ctx.font = `500 18px ${FONT}`; ctx.fillText('Habilitando contenido… conectando…', W / 2, 150);
      ctx.fillStyle = '#ddd'; ctx.fillRect(90, 190, W - 180, 18); ctx.fillStyle = '#b00020'; ctx.fillRect(90, 190, (W - 180) * 0.7, 18);
    }
    p.update();
  }
  update(dt, renderOK) {
    this.timer -= dt;
    if (S.ui.dirty) this.drawTablet();
    if (this.timer <= 0) {
      this.timer = 0.5;
      if (S.ui.tab === 'escenario') this.drawTablet();
      else { const h = lineRunning() + '|' + S.defenses; if (h !== this.lastHdr) { this.lastHdr = h; this.drawTablet(); } }
      // solo actualiza las pantallas cercanas (ahorra subidas de textura en el visor)
      const P = S.player || _p;
      this.kpiTick = !this.kpiTick;
      if (this.kpiTick || S.scenario) this.drawKPI(this.W.screens.kpi);
      const nearCtrl = Math.hypot(P.x + 112, P.z + 23) < 30, nearIT = Math.hypot(P.x + 112, P.z + 42) < 25;
      if (nearCtrl) { this.drawKPI(this.W.screens.kpiCtrl); this.drawSCADA(this.W.screens.scada); this.drawNet(this.W.screens.net); }
      if (nearIT && this.laptopMode === 'ransom') this.drawRansom(this.W.screens.laptop, true);
    }
  }
  // Coloca el toast frente a la cabeza con seguimiento suave
  updateToast(dt, cam) {
    if (!this.toast.mesh.visible) return;
    this.toastT += dt;
    const pos = cam.getWorldPosition(_p), dir = cam.getWorldDirection(_dir);
    dir.y = 0; if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); dir.normalize();
    _t.copy(pos).addScaledVector(dir, 1.7); _t.y = pos.y - 0.3;
    const m = this.toast.mesh;
    if (!this.toastInit) { m.position.copy(_t); this.toastInit = true; }
    m.position.lerp(_t, 1 - Math.exp(-2.5 * dt));
    m.lookAt(pos.x, m.position.y, pos.z);
    m.rotateX(-0.25);
    if (this.toastT > 14 && S.scenario && this.actionsFinished()) this.toast.mesh.visible = false;
  }
  actionsFinished() { return this.actions.engine.finished; }
  hideToast() { this.toast.mesh.visible = false; this.toastData = null; }
}
const _p = new THREE.Vector3(), _dir = new THREE.Vector3(), _t = new THREE.Vector3();
