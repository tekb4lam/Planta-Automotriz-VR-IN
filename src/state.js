// Estado global compartido de la simulación
export const S = {
  t: 0,
  timeScale: 1, // 1 => tiempo real; 60 => 1 s de demo = 1 min real (solo para KPIs)
  defenses: false,
  showNetwork: false,
  sound: true,
  narration: true,
  alarm: false,
  stopReasons: new Set(), // si no está vacío, la línea principal está detenida
  pressStopped: false,
  zones: {}, // id -> {status:'ok'|'warn'|'stop'|'attack', note}
  hmi: { encrypted: false, frozen: false, spoof: false, ovenShown: 180 },
  compromised: new Set(), // nodos de red comprometidos
  kpi: { downtime: 0, pressDowntime: 0, produced: 0, defects: 0, safety: 0, startT: 0 },
  scenario: null, // definición activa
  ui: { tab: 'riesgos', dirty: true },
  ovenTemp: 180,
  pressSpm: 12,
  player: null,
  listeners: [],
};

export function setZone(id, status, note = '') {
  const z = S.zones[id] || (S.zones[id] = { status: 'ok', note: '' });
  if (z.status === status && z.note === note) return;
  z.status = status; z.note = note;
  S.listeners.forEach((fn) => fn('zone', id));
  S.ui.dirty = true;
}
export function lineRunning() { return S.stopReasons.size === 0; }
export function stopLine(reason) { S.stopReasons.add(reason); S.ui.dirty = true; }
export function resumeLine(reason) { S.stopReasons.delete(reason); S.ui.dirty = true; }
