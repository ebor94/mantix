const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicios } = require('../services');
const { crearWorkerOutbox } = require('../services/worker.service');

let conn;
let bd;
let reloj;
let s;
const AHORA = new Date('2026-11-20T13:00:00Z');
const lun9 = new Date('2026-11-23T14:00:00Z');
const mar9 = new Date('2026-11-24T14:00:00Z');
const INTEG = { spa: { nombre: 'Spa', email: 'spa@ejemplo.co', direccion: 'Av 0', enEvento: false }, smsTopeDiario: 100 };

beforeAll(async () => { conn = await abrirConexion(); bd = crearBdDePrueba(); });
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  reloj = AHORA;
  await limpiar(conn);
  s = crearServicios({ bd, obtenerConfig: configDePrueba, reloj: () => reloj });
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
});

function adaptadores() {
  return {
    calendario: { upsert: jest.fn(async () => 'ev-1'), eliminar: jest.fn(async () => {}) },
    correo: { enviar: jest.fn(async () => '<id@x>') },
    sms: { enviar: jest.fn(async () => ({ id: 'sms-1' })) },
  };
}
const worker = (a, extra = {}) => crearWorkerOutbox({
  bd, obtenerConfig: configDePrueba, obtenerIntegraciones: () => ({ ok: true, config: INTEG }), adaptadores: a, reloj: () => reloj, log: { warn() {}, error() {}, info() {} }, ...extra,
});
const filas = async (sql, p = []) => (await conn.query(sql, p))[0];
const estados = async (citaId) => Object.fromEntries((await filas('SELECT tipo, canal, estado FROM msj_notificaciones WHERE cita_id = ?', [citaId])).map((n) => [`${n.tipo}/${n.canal}`, n.estado]));
async function agendada(extra = {}) {
  const b = await insertarBeneficiario(conn, { nombre: 'Ana Perez', correo: 'ana@losolivos.co', celular: '573152884079', ...extra });
  return s.citas.agendar({ beneficiarioId: b, inicio: lun9, actor: 'e', esAdmin: false });
}

test('procesa las 3 tareas de una cita nueva: evento (guarda su id), correo al spa y al empleado', async () => {
  const a = adaptadores();
  const c = await agendada();
  expect(await worker(a).procesarPendientes()).toMatchObject({ procesadas: 3, enviadas: 3 });
  expect(await estados(c.id)).toEqual({ 'calendar_upsert/google': 'enviado', 'spa_nueva/email': 'enviado', 'empleado_confirmacion/email': 'enviado' });
  expect(await filas('SELECT google_event_id FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ google_event_id: 'ev-1' }]);
  expect(a.correo.enviar.mock.calls.map(([para]) => para).sort()).toEqual(['ana@losolivos.co', 'spa@ejemplo.co']);
  expect(a.calendario.upsert.mock.calls[0][0]).toMatchObject({ googleEventId: null, beneficiario: { nombre: 'Ana Perez', correo: 'ana@losolivos.co' } });
});

test('un fallo reintenta con espera exponencial y deja el error redactado; al 5.º intento queda fallido', async () => {
  const a = adaptadores();
  a.correo.enviar.mockRejectedValue(Object.assign(new Error('SMTP caído Authorization: Bearer abc.def.ghi'), { code: 'ECONNREFUSED' }));
  const c = await agendada();
  await worker(a).procesarPendientes();
  const [n] = await filas("SELECT intentos, estado, proximo_intento, ultimo_error FROM msj_notificaciones WHERE cita_id = ? AND tipo = 'spa_nueva'", [c.id]);
  expect(n).toMatchObject({ intentos: 1, estado: 'pendiente' });
  expect(n.proximo_intento.getTime()).toBe(AHORA.getTime() + 2 * 60000);
  expect(n.ultimo_error).toMatch(/ECONNREFUSED/);
  expect(n.ultimo_error).not.toMatch(/abc\.def\.ghi/);
  for (let i = 2; i <= 5; i++) {
    reloj = new Date(reloj.getTime() + 60 * 60000);
    await worker(a).procesarPendientes();
  }
  expect(await filas("SELECT intentos, estado FROM msj_notificaciones WHERE cita_id = ? AND tipo = 'spa_nueva'", [c.id])).toEqual([{ intentos: 5, estado: 'fallido' }]);
});

test('un error no reintentable (p. ej. 401 de Háblame) queda fallido al primer intento', async () => {
  const a = adaptadores();
  a.correo.enviar.mockRejectedValue(Object.assign(new Error('Háblame respondió 401'), { reintentable: false }));
  const c = await agendada();
  await worker(a).procesarPendientes();
  expect(await filas("SELECT intentos, estado FROM msj_notificaciones WHERE cita_id = ? AND tipo = 'spa_nueva'", [c.id])).toEqual([{ intentos: 1, estado: 'fallido' }]);
});

test('revalida antes de enviar: tarea de una cita ya cancelada o con otro inicio → descartada sin llamar al adaptador', async () => {
  const a = adaptadores();
  const c = await agendada();
  // Simula una tarea vieja que quedó pendiente (p. ej. de otro worker) para un inicio que ya no es el de la cita.
  await conn.execute("INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave) VALUES (?, 'recordatorio_2d', 'email', ?)", [c.id, `${c.id}:recordatorio_2d:email:2026-11-30T14:00:00.000Z`]);
  await worker(a).procesarPendientes();
  expect((await estados(c.id))['recordatorio_2d/email']).toBe('descartado');
  await conn.execute("UPDATE msj_notificaciones SET estado = 'pendiente', proximo_intento = ? WHERE cita_id = ? AND tipo = 'empleado_confirmacion'", [AHORA, c.id]); // sin la reserva de la corrida anterior
  await conn.execute("UPDATE msj_citas SET estado = 'cancelada', slot_key = NULL, cupo_key = NULL WHERE id = ?", [c.id]);
  a.correo.enviar.mockClear();
  await worker(a).procesarPendientes();
  expect((await estados(c.id))['empleado_confirmacion/email']).toBe('descartado');
  expect(a.correo.enviar).not.toHaveBeenCalled();
});

test('cancelación: borra el evento y limpia su id; al spa solo si ya conocía la cita', async () => {
  const a = adaptadores();
  const c = await agendada();
  await worker(a).procesarPendientes();
  await s.citas.cancelar({ citaId: c.id, actor: 'e', esAdmin: false, beneficiarioIdActor: c.beneficiario_id });
  await worker(a).procesarPendientes();
  expect(a.calendario.eliminar).toHaveBeenCalledWith('ev-1');
  expect(await filas('SELECT google_event_id FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ google_event_id: null }]);
  expect((await estados(c.id))['spa_cancelada/email']).toBe('enviado');
});

test('reprogramada: el correo al spa trae el inicio anterior', async () => {
  const a = adaptadores();
  const c = await agendada();
  await worker(a).procesarPendientes();
  await s.citas.reprogramar({ citaId: c.id, inicio: mar9, actor: 'e', esAdmin: false, beneficiarioIdActor: c.beneficiario_id });
  a.correo.enviar.mockClear();
  await worker(a).procesarPendientes();
  const alSpa = a.correo.enviar.mock.calls.find(([para]) => para === 'spa@ejemplo.co');
  expect(alSpa[1].html).toMatch(/lunes 23 de noviembre[\s\S]*martes 24 de noviembre/);
  expect(a.calendario.upsert.mock.calls[1][0]).toMatchObject({ googleEventId: 'ev-1' });
});

test('empleado sin correo → su aviso se descarta (no falla en bucle)', async () => {
  const a = adaptadores();
  const c = await agendada({ correo: null });
  await worker(a).procesarPendientes();
  expect((await estados(c.id))['empleado_confirmacion/email']).toBe('descartado');
});

test('SMS: sin celular → fallido visible; tope diario alcanzado → queda pendiente para mañana', async () => {
  const a = adaptadores();
  const c1 = await agendada({ celular: null });
  await conn.execute("INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave) VALUES (?, 'recordatorio_2d', 'sms', ?)", [c1.id, `${c1.id}:recordatorio_2d:sms:${lun9.toISOString()}`]);
  await worker(a).procesarPendientes();
  expect(await filas("SELECT estado, ultimo_error FROM msj_notificaciones WHERE tipo = 'recordatorio_2d'")).toEqual([{ estado: 'fallido', ultimo_error: 'SIN_CELULAR' }]);

  await limpiar(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  const c2 = await agendada();
  await conn.execute("INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave) VALUES (?, 'recordatorio_2d', 'sms', ?)", [c2.id, `${c2.id}:recordatorio_2d:sms:${lun9.toISOString()}`]);
  const w = worker(a, { obtenerIntegraciones: () => ({ ok: true, config: { ...INTEG, smsTopeDiario: 1 } }) });
  await conn.execute("INSERT INTO msj_notificaciones (cita_id, tipo, canal, clave, estado, enviado_at) VALUES (?, 'recordatorio_2d', 'sms', 'otro', 'enviado', ?)", [c2.id, AHORA]);
  await w.procesarPendientes();
  const [n] = await filas("SELECT estado, proximo_intento FROM msj_notificaciones WHERE cita_id = ? AND tipo = 'recordatorio_2d' AND clave <> 'otro'", [c2.id]);
  expect(n.estado).toBe('pendiente');
  expect(n.proximo_intento.toISOString()).toBe('2026-11-21T05:00:00.000Z'); // mañana 00:00 hora Colombia
  expect(a.sms.enviar).not.toHaveBeenCalled();
});

test('dos workers a la vez no envían la misma tarea dos veces', async () => {
  const a = adaptadores();
  for (let i = 0; i < 4; i++) {
    const b = await insertarBeneficiario(conn, { correo: `p${i}@losolivos.co` });
    await s.citas.agendar({ beneficiarioId: b, inicio: new Date(lun9.getTime() + i * 86400000), actor: 'e', esAdmin: false });
  }
  const [r1, r2] = await Promise.all([worker(a).procesarPendientes(), worker(a).procesarPendientes()]);
  expect(r1.procesadas + r2.procesadas).toBe(12);
  expect(a.correo.enviar).toHaveBeenCalledTimes(8);
  expect(a.calendario.upsert).toHaveBeenCalledTimes(4);
});

test('sin integraciones configuradas no procesa nada y avisa una sola vez', async () => {
  const a = adaptadores();
  await agendada();
  const log = { warn: jest.fn(), error() {}, info() {} };
  const w = worker(a, { obtenerIntegraciones: () => ({ ok: false, motivo: 'Faltan variables: MSJ_HABLAME_API_KEY' }), log });
  expect(await w.procesarPendientes()).toMatchObject({ procesadas: 0 });
  await w.procesarPendientes();
  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(a.correo.enviar).not.toHaveBeenCalled();
});

test('carrera: el empleado cancela mientras el worker envía "nueva" al spa → el spa recibe la cancelación y el descarte no se pisa', async () => {
  const a = adaptadores();
  let soltar;
  let enviando;
  const yaEnvia = new Promise((r) => { enviando = r; });
  a.correo.enviar.mockImplementation(async (para) => {
    if (para === 'spa@ejemplo.co') { enviando(); await new Promise((r) => { soltar = r; }); }
    return '<id@x>';
  });
  const c = await agendada();
  const corrida = worker(a).procesarPendientes();
  await yaEnvia; // el correo al spa está "saliendo"
  await s.citas.cancelar({ citaId: c.id, actor: 'e', esAdmin: false, beneficiarioIdActor: c.beneficiario_id });
  soltar();
  await corrida;
  const e = await estados(c.id);
  expect(e['spa_nueva/email']).toBe('descartado'); // el worker no lo pasó a "enviado" encima del descarte
  expect(e['spa_cancelada/email']).toBe('pendiente'); // y el spa sí recibe la cancelación
});
