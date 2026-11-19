import { S } from './state.js';

// Audio sintetizado con WebAudio (sin archivos externos)
export class Audio {
  constructor() { this.ctx = null; this.listener = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = S.sound ? 0.8 : 0; this.master.connect(c.destination);
    // ruido base
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.brown = buf;
    const wbuf = c.createBuffer(1, c.sampleRate, c.sampleRate), wd = wbuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wbuf;
    const hum = c.createBufferSource(); hum.buffer = buf; hum.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const hg = c.createGain(); hg.gain.value = 0.25;
    hum.connect(lp).connect(hg).connect(this.master); hum.start();
    const osc = c.createOscillator(); osc.frequency.value = 60; const og = c.createGain(); og.gain.value = 0.02;
    osc.connect(og).connect(this.master); osc.start();
    // sirena
    this.siren = c.createOscillator(); this.siren.type = 'square'; this.siren.frequency.value = 700;
    const sf = c.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(sf).connect(this.sirenGain).connect(this.master); this.siren.start();
  }
  setEnabled(on) { if (this.master) this.master.gain.value = on ? 0.8 : 0; }
  vol(pos) {
    if (!S.player || !pos) return 1;
    const d = S.player.distanceTo(pos);
    return 1 / (1 + d / 8);
  }
  burst(gain, dur, freq, type = 'lowpass', src = 'white') {
    const c = this.ctx; if (!c || !S.sound) return;
    const n = c.createBufferSource(); n.buffer = src === 'white' ? this.white : this.brown;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); const t = c.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.master); n.start(t); n.stop(t + dur + 0.05);
  }
  tone(freq, gain, dur, type = 'sine', end = null) {
    const c = this.ctx; if (!c || !S.sound) return;
    const o = c.createOscillator(); o.type = type; const t = c.currentTime;
    o.frequency.setValueAtTime(freq, t); if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  thump(pos) { const v = this.vol(pos); if (v < 0.05) return; this.tone(70, 0.9 * v, 0.5, 'sine', 35); this.burst(0.5 * v, 0.25, 300, 'lowpass', 'brown'); }
  zap(pos) { const v = this.vol(pos); if (v < 0.12) return; this.burst(0.25 * v, 0.12, 2500, 'highpass'); }
  crash(pos) { const v = Math.max(0.3, this.vol(pos)); this.burst(1.2 * v, 1.4, 900, 'lowpass', 'brown'); this.tone(90, 0.8 * v, 1.0, 'sawtooth', 30); }
  click() { this.tone(1200, 0.12, 0.06, 'square'); }
  alert() { this.tone(880, 0.15, 0.15, 'triangle'); setTimeout(() => this.tone(660, 0.15, 0.2, 'triangle'), 160); }
  update(t) {
    if (!this.ctx) return;
    const on = S.alarm && S.sound;
    this.sirenGain.gain.value = on ? 0.05 : 0;
    if (on) this.siren.frequency.value = Math.sin(t * Math.PI * 1.25) > 0 ? 960 : 720;
  }
}
