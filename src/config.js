// ===== Configuración editable =====
export const BRAND = 'INET · Cybersecurity Experts';
export const TITLE = 'Planta Automotriz VR · Simulador de riesgos OT';
// Supuesto ilustrativo para calcular el costo del paro (ajústalo a tu caso)
export const COST_PER_MIN_USD = 22000;
// Producción nominal de la planta (jobs per hour)
export const JPH = 60;

// ===== Geometría de la planta (metros, escala 1:1) =====
export const B = { x0: -120, x1: 120, z0: -50, z1: 50, h: 14 };
export const LINE = { z: -6, x0: -40, pitch: 6.5, N: 24, convY: 0.45, bodyY: 0.6, cycle: 12, move: 3.5 };
export const PRESS = { xs: [-88, -79, -70, -61, -52], z: -18, cycle: 5 };
export const WALK = { z0: 1.5, z1: 5.5 };
export const AGVP = { zE: 10, zW: 19, x0: -80, x1: 96 };
export const ROOMS = {
  office: { x0: -119, x1: -105, z0: -49, z1: -35 },
  control: { x0: -119, x1: -105, z0: -31, z1: -15 },
};
export const PLATFORM = { x0: -7, x1: 7, z0: 11, z1: 18, y: 9 };

export function zoneOfSlot(i) {
  if (i <= 7) return 'biw';
  if (i <= 13) return 'paint';
  if (i <= 15) return 'oven';
  if (i <= 21) return 'asm';
  return 'qc';
}
export const slotX = (i) => LINE.x0 + i * LINE.pitch;

export const ZONES = {
  it: 'Oficinas IT',
  ctrl: 'Sala de control OT',
  press: 'Estampado',
  biw: 'Carrocería (BIW)',
  paint: 'Pintura',
  oven: 'Horno de curado',
  asm: 'Ensamble final',
  qc: 'Calidad',
  log: 'Logística / AGVs',
};

export const LOCATIONS = [
  { id: 'entrada', name: 'Entrada', x: -114, y: 0, z: 3.5, yaw: -Math.PI / 2 },
  { id: 'control', name: 'Sala de control', x: -106.8, y: 0, z: -21.5, yaw: Math.PI / 2 + 0.12 },
  { id: 'it', name: 'Oficinas IT', x: -106.5, y: 0, z: -37.6, yaw: Math.PI / 2 - 0.35 },
  { id: 'prensas', name: 'Estampado', x: -72, y: 0, z: -6.5, yaw: 0.1, pitch: 0.12 },
  { id: 'biw', name: 'Carrocería', x: -26, y: 0, z: 3.6, yaw: 0.1 },
  { id: 'pintura', name: 'Pintura', x: 24, y: 0, z: 3.6, yaw: 0.1 },
  { id: 'horno', name: 'Horno', x: 59, y: 0, z: 3.6, yaw: 0.2 },
  { id: 'ensamble', name: 'Ensamble', x: 75, y: 0, z: 0.9, yaw: 0.3, pitch: -0.08 },
  { id: 'calidad', name: 'Calidad', x: 101, y: 0, z: 3.6, yaw: -0.25 },
  { id: 'logistica', name: 'Logística AGV', x: -22, y: 0, z: 14.5, yaw: -Math.PI / 2 },
  { id: 'aerea', name: 'Vista elevada', x: 0, y: PLATFORM.y, z: 11.7, yaw: 0, pitch: -0.42 },
];
