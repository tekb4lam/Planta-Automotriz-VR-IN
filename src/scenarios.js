import { S } from './state.js';

const RED = 0xff2a2a;
const LINE_Z = ['biw', 'paint', 'oven', 'asm', 'qc'];

export const DEFS = [
  {
    id: 'ransomware', n: 1, title: 'Ransomware: de IT a OT', short: 'Phishing → movimiento lateral → cifrado de SCADA/HMI',
    techniques: ['T0865 Spearphishing Attachment', 'T0886 Remote Services', 'T0867 Lateral Tool Transfer', 'T0815 Denial of View', 'T0828 Loss of Productivity and Revenue'],
    ref: 'Caso real: el ciberataque a Jaguar Land Rover (ago-2025) detuvo su producción global ~5 semanas; Honda (2020) paró plantas por el ransomware EKANS.',
    mitig: ['Segmentación IT/OT con DMZ (IEC 62443: zonas y conductos)', 'MFA y jump server para todo acceso remoto', 'EDR / lista blanca de aplicaciones en HMI', 'Respaldos offline probados y plan de recuperación', 'Concientización y simulacros de phishing'],
    steps: [
      { t: 0, text: 'Un empleado abre un adjunto malicioso recibido por correo (phishing). Su laptop queda comprometida.', run: (c) => { c.laptop('phish'); c.compromise('laptop'); c.mark('laptop', 'Phishing: adjunto malicioso', '#ffb020'); c.zone('it', 'attack', 'Equipo comprometido'); c.net.stream(['laptop', 'itsrv'], RED, { life: 4 }); } },
      { t: 6, text: 'Con credenciales robadas, el atacante se mueve lateralmente hacia la red industrial por escritorio remoto (RDP).', gate: 'BLOQUEADO en el firewall IT/OT: la segmentación por zonas y conductos, reglas de mínimo privilegio y MFA en el acceso remoto impiden el salto a OT. El incidente queda contenido en IT y la planta sigue produciendo.',
        run: (c, b) => { c.compromise('itsrv'); c.net.stream(['itsrv', 'fw', 'scada'], RED, { blockAt: b ? 'fw' : null, life: b ? 10 : 6 }); } },
      { t: 12, text: 'El ransomware se despliega en los servidores SCADA/MES y en las estaciones HMI de la sala de control.', run: (c) => { c.compromise('scada'); c.net.stream(['scada', 'hmi'], RED, { life: 4 }); c.zone('ctrl', 'attack', 'Cifrado en curso'); c.mark('scada', 'Ransomware en SCADA/MES', '#ff3030'); } },
      { t: 16, text: 'Pantallas cifradas: los operadores pierden la visibilidad del proceso (pérdida de vista).', run: (c) => { S.hmi.encrypted = true; c.compromise('hmi'); c.laptop('ransom'); c.mark('hmi', 'HMI cifradas', '#ff3030'); c.audio.alert(); } },
      { t: 22, kind: 'impact', text: 'Sin órdenes de producción del MES y sin supervisión, toda la planta se detiene por seguridad. Cada minuto de paro es producción perdida.', run: (c) => { c.stop('ransomware'); S.pressStopped = true; c.alarm(true); LINE_Z.forEach((z) => c.zone(z, 'stop', 'Sin MES')); c.zone('press', 'stop', 'Sin MES'); c.zone('log', 'warn', 'Sin órdenes'); } },
      { t: 32, kind: 'impact', text: 'Recuperarse exige aislar la red, reconstruir servidores desde respaldos limpios y validar cada sistema: días o semanas de paro y proveedores detenidos.' },
    ],
  },
  {
    id: 'robots', n: 2, title: 'Lógica alterada en robots de soldadura', short: 'Laptop de tercero → descarga de programa al PLC',
    techniques: ['T0843 Program Download', 'T0889 Modify Program', 'T0831 Manipulation of Control', 'T0832 Manipulation of View', 'T0880 Loss of Safety'],
    ref: 'Concepto análogo a Stuxnet (2010): lógica de PLC alterada mientras el operador veía valores normales.',
    mitig: ['NAC: solo equipos registrados en la red de mantenimiento', 'Programas firmados, verificación de hash y gestión de cambios', 'Llave física del PLC en modo RUN', 'Monitoreo pasivo de red OT (descargas de programa)', 'Safety PLC / envolventes independientes del PLC de proceso'],
    steps: [
      { t: 0, text: 'Un contratista conecta su laptop (infectada) a la red de mantenimiento de Carrocería para "actualizar" un robot.', run: (c) => { c.W.contractor.visible = true; c.mark('contractor', 'Laptop de tercero', '#ffb020'); c.zone('biw', 'warn', 'Equipo externo'); } },
      { t: 5, text: 'Desde esa laptop se descarga una lógica modificada al PLC y a los controladores de robot (Program Download).', gate: 'BLOQUEADO: el control de acceso a red (NAC) aísla la laptop no registrada y el PLC rechaza programas sin firma. El monitoreo OT alerta al SOC.',
        run: (c, b) => { c.compromise('contractor'); c.net.stream(['contractor', 'plc_biw'], RED, { blockAt: b ? 'plc_biw' : null, life: b ? 10 : 4, rate: 8 }); } },
      { t: 9, text: 'Los robots ejecutan trayectorias alteradas: sueldan fuera de los puntos programados y salen de su envolvente de seguridad.', run: (c) => { c.compromise('plc_biw'); c.robotsRogue(); S.attackFx.robots = true; c.zone('biw', 'attack', 'Lógica alterada'); c.mark('plc_biw', 'Programa PLC modificado', '#ff3030'); } },
      { t: 14, text: 'Manipulación de la vista: el HMI sigue mostrando "Carrocería OK", así que nadie detiene la línea. Cada carrocería que pasa sale con soldaduras defectuosas.', run: () => { S.hmi.spoofBiw = true; } },
      { t: 24, kind: 'impact', text: 'Riesgo para personas: un robot fuera de su envolvente puede lesionar a un técnico que entre a la celda.', run: (c) => { S.kpi.safety++; c.mark('biwcell', 'Robot fuera de envolvente', '#ff3030'); } },
      { t: 34, kind: 'impact', text: 'Las unidades llegarán a Calidad con soldaduras faltantes: scrap, retrabajo y riesgo de recall de autos ya embarcados.', run: (c) => c.zone('qc', 'warn', 'Rechazos') },
    ],
  },
  {
    id: 'press', n: 3, title: 'Comandos no autorizados a prensas', short: 'Escritura Modbus/TCP → sobrevelocidad → choque de troquel',
    techniques: ['T0855 Unauthorized Command Message', 'T0836 Modify Parameter', 'T0879 Damage to Property', 'T0880 Loss of Safety', 'T0828 Loss of Productivity and Revenue'],
    ref: 'Caso documentado: el BSI alemán reportó (2014) daño físico grave en un alto horno de una acería tras un ciberataque.',
    mitig: ['Firewall industrial con DPI: solo lectura desde HMI', 'Protocolos con autenticación (CIP Security, Modbus/TCP Security)', 'Límites de velocidad en hardware y SIS independiente', 'Alertas por cambio de parámetros críticos', 'Cuentas nominativas en estaciones de ingeniería'],
    steps: [
      { t: 0, text: 'Una estación HMI de la sala de control está comprometida y el atacante tiene acceso a la red de control.', run: (c) => { c.compromise('hmi'); c.mark('hmi', 'HMI comprometida', '#ffb020'); c.zone('ctrl', 'warn', 'Acceso sospechoso'); } },
      { t: 5, text: 'Envía comandos de escritura Modbus/TCP —un protocolo sin autenticación— directamente al PLC de prensas.', gate: 'BLOQUEADO: el firewall industrial con inspección profunda (DPI) solo permite funciones de lectura hacia el PLC; la escritura se descarta y se genera una alerta.',
        run: (c, b) => { c.net.stream(['hmi', 'plc_press'], RED, { blockAt: b ? 'plc_press' : null, life: b ? 10 : 6, rate: 8 }); } },
      { t: 9, text: 'Parámetro de velocidad modificado: la prensa pasa de 12 a 40 golpes por minuto, fuera de su rango seguro.', run: (c) => { c.compromise('plc_press'); c.press.overspeed(); c.zone('press', 'attack', 'Sobrevelocidad'); c.mark('plc_press', 'Comando no autorizado', '#ff3030'); } },
      { t: 17, kind: 'impact', text: 'El transfer pierde sincronía: lámina atascada y choque de troquel. Daño a herramentales y riesgo para el personal.', run: (c) => { c.press.crash(2); c.zone('press', 'stop', 'Choque de troquel'); c.alarm(true); S.kpi.safety++; c.mark('press2', 'Choque de troquel', '#ff3030'); } },
      { t: 25, kind: 'impact', text: 'Sin paneles estampados, Carrocería consume su inventario intermedio. Un troquel dañado puede tardar semanas en repararse.' },
      { t: 33, kind: 'impact', text: 'Inventario de paneles agotado: Carrocería y el resto de la línea se detienen.', run: (c) => { c.stop('press'); c.zone('biw', 'stop', 'Sin paneles'); } },
    ],
  },
  {
    id: 'agv', n: 4, title: 'Secuestro inalámbrico de AGVs', short: 'Wi-Fi débil → servidor de flota falso → rutas maliciosas',
    techniques: ['T0860 Wireless Compromise', 'T0848 Rogue Master', 'T0855 Unauthorized Command Message', 'T0880 Loss of Safety', 'T0828 Loss of Productivity and Revenue'],
    ref: 'Los vehículos autónomos dependen de la red: si el canal de mando no se autentica, quien lo controla controla la flota.',
    mitig: ['802.1X / WPA3-Enterprise con certificado por dispositivo', 'Detección inalámbrica (WIDS) de equipos intrusos', 'Segmentación y lista blanca para la red de AGVs', 'Geocercas y paro por escáner de seguridad, independiente de la red', 'Autenticación de mensajes del servidor de flota'],
    steps: [
      { t: 0, text: 'Un dispositivo no autorizado escondido en el almacén escanea el Wi-Fi industrial, protegido solo por una clave compartida (PSK) que conocen muchos.', run: (c) => { c.W.rogue.visible = true; c.mark('rogue', 'Dispositivo intruso', '#ffb020'); c.zone('log', 'warn', 'Equipo intruso'); } },
      { t: 6, text: 'Se une a la red de AGVs y suplanta al servidor de flota (rogue master), enviando rutas falsas.', gate: 'BLOQUEADO: 802.1X / WPA3-Enterprise con certificados rechaza al equipo intruso; la red de AGVs está segmentada y monitoreada.',
        run: (c, b) => { c.compromise('rogue'); c.net.stream(['rogue', 'ap'], RED, { blockAt: b ? 'ap' : null, life: b ? 10 : 5, rate: 8 }); } },
      { t: 10, text: 'Los AGVs abandonan su ruta guiada y aceleran sin control por la nave.', run: (c) => { c.compromise('ap'); c.agv.hijackAll(); c.zone('log', 'attack', 'Rutas falsas'); c.mark('ap', 'Wi-Fi industrial comprometido', '#ff3030'); c.alarm(true); } },
      { t: 17, kind: 'impact', text: 'Los AGVs invaden pasillos peatonales y colisionan entre sí: riesgo directo para las personas.' },
      { t: 27, kind: 'impact', text: 'Ensamble final se queda sin material (kitting) y la línea se detiene por falta de piezas.', run: (c) => { c.stop('agv'); c.zone('asm', 'stop', 'Sin material'); } },
    ],
  },
  {
    id: 'oven', n: 5, title: 'Lecturas falsas en el horno de pintura', short: 'Adversary-in-the-middle → temperatura falsificada',
    techniques: ['T0830 Adversary-in-the-Middle', 'T0856 Spoof Reporting Message', 'T0832 Manipulation of View', 'T0836 Modify Parameter', 'T0879 Damage to Property', 'T0880 Loss of Safety'],
    ref: 'Stuxnet (2010) mostraba lecturas normales al operador mientras dañaba el proceso; TRITON (2017) atacó directamente un sistema instrumentado de seguridad.',
    mitig: ['Medición redundante y alarmas por discrepancia', 'SIS independiente de la red de control', 'Integridad y autenticación de mensajes de proceso', 'Monitoreo OT de anomalías de proceso', 'Termómetro / indicador local verificado en ronda'],
    steps: [
      { t: 0, text: 'Malware en el servidor SCADA se coloca entre el HMI y el PLC del horno (adversary-in-the-middle).', run: (c) => { c.compromise('scada'); c.mark('scada', 'SCADA comprometido', '#ffb020'); c.zone('ctrl', 'warn', 'Tráfico anómalo'); } },
      { t: 5, text: 'Intercepta y altera los mensajes: falsifica la lectura de temperatura y sube la consigna de los quemadores.', gate: 'BLOQUEADO: sensores redundantes detectan la discrepancia y el sistema instrumentado de seguridad (SIS), independiente de la red, apaga los quemadores.',
        run: (c, b) => { c.net.stream(['scada', 'plc_oven'], RED, { blockAt: b ? 'plc_oven' : null, life: b ? 10 : 8, rate: 8 }); } },
      { t: 9, text: 'El HMI muestra 180 °C estables… mientras el termómetro local del horno sube sin control.', run: (c) => { c.compromise('plc_oven'); S.hmi.spoofOven = true; S.ovenTarget = 335; S.attackFx.oven = true; c.zone('oven', 'attack', 'Temperatura falsa'); c.mark('plc_oven', 'Lecturas falsificadas', '#ff3030'); } },
      { t: 22, kind: 'impact', text: 'Las carrocerías salen con la pintura quemada: el lote completo es scrap o retrabajo.' },
      { t: 32, kind: 'impact', text: 'Humo en el horno, en una zona con solventes inflamables: riesgo de incendio. Se activa la evacuación y la planta se detiene.', run: (c) => { c.stop('oven'); c.alarm(true); c.zone('oven', 'stop', 'Riesgo de incendio'); c.zone('paint', 'stop', 'Evacuación'); S.kpi.safety++; c.mark('ovenbox', 'Riesgo de incendio', '#ff3030'); } },
    ],
  },
  {
    id: 'dos', n: 6, title: 'Denegación de servicio en red OT', short: 'Tormenta de tráfico → pérdida de vista y de control',
    techniques: ['T0814 Denial of Service', 'T0815 Denial of View', 'T0813 Denial of Control', 'T0826 Loss of Availability', 'T0828 Loss of Productivity and Revenue'],
    ref: 'Muchos PLC y switches industriales antiguos fallan ante ráfagas de tráfico o escaneos agresivos, incluso sin intención maliciosa.',
    mitig: ['Storm-control y QoS en switches industriales', 'Segmentación y redundancia (anillos)', 'Línea base y monitoreo del tráfico OT', 'Protección de puertos y deshabilitar los no usados', 'Escaneos activos solo en ventanas controladas'],
    steps: [
      { t: 0, text: 'Un equipo infectado en la red de control empieza a inundarla de tráfico (tormenta de broadcast / DoS).', run: (c) => { c.compromise('hmi'); c.mark('hmi', 'Origen del tráfico', '#ffb020'); } },
      { t: 3, text: 'El tráfico satura switches y enlaces de la red OT.', gate: 'CONTENIDO: storm-control, QoS y segmentación en los switches industriales limitan el tráfico. La red de control sigue respondiendo y la planta no se detiene.',
        run: (c, b) => { ['plc_press', 'plc_biw', 'plc_paint', 'plc_oven', 'plc_asm', 'plc_qc'].forEach((p) => c.net.stream(['hmi', 'scada', p], RED, { blockAt: b ? 'scada' : null, rate: b ? 3 : 14, speed: 24, line: !b })); } },
      { t: 8, text: 'Los PLC pierden comunicación con HMI y SCADA: pantallas congeladas, "Sin comunicación".', run: (c) => { S.hmi.frozen = true; c.zone('ctrl', 'attack', 'Sin comunicación'); c.mark('scada', 'Red OT saturada', '#ff3030'); } },
      { t: 12, text: 'Robots y transportadores entran en paro seguro por pérdida de comunicación (watchdog): la línea arranca y se detiene de forma intermitente.', run: (c) => { S.dosStutter = true; LINE_Z.forEach((z) => c.zone(z, 'warn', 'Intermitente')); } },
      { t: 26, kind: 'impact', text: 'Paro total: la línea queda detenida hasta restablecer la red.', run: (c) => { S.dosStutter = false; c.stop('dos'); c.alarm(true); LINE_Z.forEach((z) => c.zone(z, 'stop', 'Sin red')); } },
    ],
  },
];

export class ScenarioEngine {
  constructor(ctx) { this.ctx = ctx; this.active = null; this.t = 0; this.idx = 0; this.log = []; this.blocked = false; this.stutterT = 0; }
  start(id) {
    this.ctx.resetAll();
    const def = DEFS.find((d) => d.id === id);
    if (!def) return;
    this.active = def; S.scenario = def;
    this.t = 0; this.idx = 0; this.log = []; this.blocked = false;
    S.ui.tab = 'escenario'; S.ui.sub = 'log'; S.ui.dirty = true;
    this.ctx.audio.alert();
  }
  stop() { this.active = null; S.scenario = null; this.log = []; S.ui.dirty = true; }
  update(dt) {
    const a = this.active;
    if (!a) return;
    this.t += dt;
    while (!this.blocked && this.idx < a.steps.length && this.t >= a.steps[this.idx].t) {
      const st = a.steps[this.idx++];
      if (st.gate && S.defenses) {
        st.run?.(this.ctx, true);
        this.blocked = true;
        this.log.push({ text: st.gate, kind: 'block', t: this.t });
        this.ctx.fwFlash?.();
        this.ctx.audio.alert();
      } else {
        st.run?.(this.ctx, false);
        this.log.push({ text: st.text, kind: st.kind || 'step', t: this.t });
      }
      this.ctx.toast(a, this.log[this.log.length - 1]);
      S.ui.dirty = true;
    }
    if (S.dosStutter) {
      this.stutterT -= dt;
      if (this.stutterT <= 0) {
        this.stutterT = 1 + Math.random() * 2.5;
        if (S.stopReasons.has('dos-int')) S.stopReasons.delete('dos-int'); else S.stopReasons.add('dos-int');
      }
    } else S.stopReasons.delete('dos-int');
  }
  get finished() { return this.active && (this.blocked || this.idx >= this.active.steps.length); }
}
