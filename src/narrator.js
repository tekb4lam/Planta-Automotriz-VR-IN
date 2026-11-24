import { S } from './state.js';

// Narradora (voz generada con ElevenLabs) + efectos de sonido de los escenarios.
// Los clips se describen en assets/audio/manifest.json (lo genera tools/gen_audio.py) y se cargan
// bajo demanda por escenario. Mientras la narradora habla, el sonido ambiente baja de volumen.
const BASE = './assets/';

export class Narrator {
  constructor(audio) {
    this.audio = audio;
    this.man = null;
    this.buf = new Map(); this.loading = new Map();
    this.q = []; this.cur = null; this.src = null; this.token = 0; this.fx = new Set();
    this.ready = fetch(BASE + 'audio/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => (this.man = m)).catch(() => {});
  }
  get on() { return S.narration && !!this.man; }
  get busy() { return !!this.cur || this.q.length > 0; }
  scen(id) { return this.man && this.man.scenarios ? this.man.scenarios[id] : null; }
  _ctx() {
    this.audio.init();
    const c = this.audio.ctx;
    if (c && !this.vg) {
      this.vg = c.createGain(); this.vg.gain.value = 1.0; this.vg.connect(c.destination);
      this.sg = c.createGain(); this.sg.gain.value = 0.6; this.sg.connect(c.destination);
    }
    return c;
  }
  load(file) {
    if (!file) return Promise.resolve(null);
    if (this.buf.has(file)) return Promise.resolve(this.buf.get(file));
    const c = this._ctx();
    if (!c) return Promise.resolve(null);
    if (!this.loading.has(file)) {
      this.loading.set(file, fetch(BASE + file).then((r) => r.arrayBuffer()).then((a) => c.decodeAudioData(a))
        .then((b) => { this.buf.set(file, b); return b; }).catch(() => null));
    }
    return this.loading.get(file);
  }
  // descarga anticipada de todos los clips de un escenario
  prefetch(id) {
    const m = this.scen(id);
    if (!m) return;
    const files = [m.intro, m.outro, m.gate && m.gate.voz, ...m.steps.map((s) => s.voz)].filter(Boolean).map((v) => v.file);
    const fx = [m.gate && m.gate.sfx, ...m.steps.map((s) => s.sfx)].filter(Boolean).map((k) => this.man.sfx[k] && this.man.sfx[k].file);
    [...files, ...fx].forEach((f) => this.load(f));
  }
  say(clip) {
    if (!this.on || !clip) return;
    this.q.push(clip);
    if (!this.cur) this._next();
  }
  async _next() {
    const clip = this.q.shift();
    if (!clip) { this.cur = null; this._duck(false); return; }
    this.cur = clip;
    const tk = this.token;
    const b = await this.load(clip.file);
    if (tk !== this.token) return;
    if (!b) { this.cur = null; this._next(); return; }
    const c = this._ctx();
    const s = c.createBufferSource(); s.buffer = b; s.connect(this.vg);
    this._duck(true);
    let done = false;
    const end = () => {
      if (done || tk !== this.token || this.src !== s) return;
      done = true; this.src = null;
      setTimeout(() => { if (tk === this.token) { this.cur = null; this._next(); } }, 350);
    };
    s.onended = end;
    // respaldo: si el audio está suspendido (sin gesto del usuario) la narración no bloquea el escenario
    setTimeout(end, (b.duration + 1.5) * 1000);
    if (c.state !== 'running') c.resume?.();
    this.src = s; s.start();
  }
  sfx(name) {
    if (!this.on || !name || !this.man.sfx[name]) return;
    const tk = this.token;
    this.load(this.man.sfx[name].file).then((b) => {
      if (!b || tk !== this.token) return;
      const s = this.audio.ctx.createBufferSource(); s.buffer = b; s.connect(this.sg);
      s.onended = () => this.fx.delete(s);
      this.fx.add(s); s.start();
    });
  }
  stop() {
    this.token++;
    this.q = []; this.cur = null;
    try { this.src && this.src.stop(); } catch (e) { /* ya detenido */ }
    this.src = null;
    this.fx.forEach((s) => { try { s.stop(); } catch (e) { /* */ } });
    this.fx.clear();
    this._duck(false);
  }
  _duck(on) {
    const a = this.audio;
    if (!a.master || !a.ctx) return;
    a.master.gain.setTargetAtTime(S.sound ? (on ? 0.25 : 0.8) : 0, a.ctx.currentTime, 0.25);
  }
}
