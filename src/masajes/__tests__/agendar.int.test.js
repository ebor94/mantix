const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana, insertarBloqueo } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicios } = require('../services');

let conn;
let bd;
let citas;
const ahora = new Date('2026-11-20T13:00:00Z'); // viernes 20-nov 8:00 local
const lun9 = new Date('2026-11-23T14:00:00Z');
const auditoria = { ip: '10.0.0.1', userAgent: 'jest', requestId: 'MSJ-CIT-001' };
beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  ({ citas } = crearServicios({ bd, obtenerConfig: configDePrueba, reloj: () => ahora }));
});
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(() => limpiar(conn));

const agendar = (beneficiarioId, inicio, extra = {}) => citas.agendar({ beneficiarioId, inicio, actor: 'eortega', esAdmin: false, auditoria, ...extra });
const motivo = async (p) => { try { await p; } catch (e) { return e.motivo || e.code || e.message; } return 'NO_LANZO'; };
const filas = async (sql, p = []) => (await conn.query(sql, p))[0];

test('agenda: cita, historial y las 3 notificaciones del outbox, todo en una transacción', async () => {
  const b = await insertarBeneficiario(conn);
  const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  const cita = await agendar(b, lun9);
  expect(cita).toMatchObject({ beneficiario_id: b, estado: 'agendada', periodo: '2026-11' });
  expect(cita.inicio.toISOString()).toBe(lun9.toISOString());
  expect(cita.fin.toISOString()).toBe('2026-11-23T15:00:00.000Z');

  const [c] = await filas('SELECT semana_id, slot_key, cupo_key, creado_por FROM msj_citas WHERE id = ?', [cita.id]);
  expect(c).toEqual({ semana_id: s, slot_key: '2026-11-23T09:00#1', cupo_key: `${b}:2026-11`, creado_por: 'eortega' });
  expect(await filas('SELECT accion, usuario, es_admin, ip, request_id FROM msj_cita_historial WHERE cita_id = ?', [cita.id]))
    .toEqual([{ accion: 'creada', usuario: 'eortega', es_admin: 0, ip: '10.0.0.1', request_id: 'MSJ-CIT-001' }]);
  // ORDER BY sobre un ENUM ordena por su posición, no alfabéticamente: se ordena aquí.
  const n = (await filas('SELECT tipo, canal, clave, estado FROM msj_notificaciones WHERE cita_id = ?', [cita.id]))
    .sort((x, y) => x.tipo.localeCompare(y.tipo));
  expect(n.map((x) => [x.tipo, x.canal, x.estado])).toEqual([
    ['calendar_upsert', 'google', 'pendiente'], ['empleado_confirmacion', 'email', 'pendiente'], ['spa_nueva', 'email', 'pendiente'],
  ]);
  expect(n[0].clave).toBe(`${cita.id}:calendar_upsert:google:2026-11-23T14:00:00.000Z`);
});

test('dos personas, la misma franja, al mismo tiempo: solo una la obtiene (x5)', async () => {
  for (let ronda = 0; ronda < 5; ronda++) {
    await limpiar(conn);
    const b1 = await insertarBeneficiario(conn);
    const b2 = await insertarBeneficiario(conn);
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const r = await Promise.allSettled([agendar(b1, lun9), agendar(b2, lun9)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected').reason.motivo).toBe('SLOT_OCUPADO');
    expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 1 }]);
    expect(await filas('SELECT COUNT(*) AS n FROM msj_notificaciones')).toEqual([{ n: 3 }]); // nada del perdedor
  }
});

test('capacidad 2: tres a la vez → dos entran (#1 y #2) y la tercera recibe SLOT_OCUPADO', async () => {
  const bs = [await insertarBeneficiario(conn), await insertarBeneficiario(conn), await insertarBeneficiario(conn)];
  await insertarSemana(conn, { fecha_inicio: '2026-11-23', capacidad_franja: 2 });
  const r = await Promise.allSettled(bs.map((b) => agendar(b, lun9)));
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(2);
  expect(r.filter((x) => x.status === 'rejected').map((x) => x.reason.motivo)).toEqual(['SLOT_OCUPADO']);
  expect((await filas('SELECT slot_key FROM msj_citas ORDER BY slot_key')).map((x) => x.slot_key)).toEqual(['2026-11-23T09:00#1', '2026-11-23T09:00#2']);
});

test('la misma persona, dos franjas del mismo mes, al mismo tiempo → una sola cita', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  const r = await Promise.allSettled([agendar(b, lun9), agendar(b, new Date('2026-11-24T14:00:00Z'))]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(r.find((x) => x.status === 'rejected').reason.motivo).toBe('CUPO_MES_USADO');
});

test('segunda cita del mes → CUPO_MES_USADO; una en diciembre sí entra', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  await insertarSemana(conn, { fecha_inicio: '2026-11-30' });
  await agendar(b, lun9);
  expect(await motivo(agendar(b, new Date('2026-11-25T14:00:00Z')))).toBe('CUPO_MES_USADO');
  const dic = await agendar(b, new Date('2026-12-01T14:00:00Z')); // martes 1-dic
  expect(dic.periodo).toBe('2026-12');
});

test.each([
  ['semana no publicada', { estado: 'borrador' }, lun9],
  ['hora que no es franja (11:00)', {}, new Date('2026-11-23T16:00:00Z')],
  ['sin semana', null, new Date('2026-12-07T14:00:00Z')],
])('%s → FUERA_DE_VENTANA', async (_, semana, inicio) => {
  const b = await insertarBeneficiario(conn);
  if (semana) await insertarSemana(conn, { fecha_inicio: '2026-11-23', ...semana });
  expect(await motivo(agendar(b, inicio))).toBe('FUERA_DE_VENTANA');
});

test('franja bloqueada → FUERA_DE_VENTANA', async () => {
  const b = await insertarBeneficiario(conn);
  const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  await insertarBloqueo(conn, { semana_id: s, inicio: lun9, fin: new Date(lun9.getTime() + 3600000) });
  expect(await motivo(agendar(b, lun9))).toBe('FUERA_DE_VENTANA');
});

test('empleado con menos de 24 h → ANTICIPACION_INSUFICIENTE; el admin sí puede', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-16' }); // semana del 16 con festivo el lunes
  const vie9 = new Date('2026-11-20T14:00:00Z'); // hoy a las 9:00, falta 1 h
  expect(await motivo(agendar(b, vie9))).toBe('ANTICIPACION_INSUFICIENTE');
  expect((await agendar(b, vie9, { esAdmin: true, actor: 'admin1' })).estado).toBe('agendada');
  expect(await filas('SELECT es_admin, usuario FROM msj_cita_historial')).toEqual([{ es_admin: 1, usuario: 'admin1' }]);
});

test('un esAdmin que no es exactamente true (p. ej. "true" de un query string) no salta la anticipación', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-16' });
  const vie9 = new Date('2026-11-20T14:00:00Z');
  for (const esAdmin of ['true', 1, {}]) {
    expect(await motivo(agendar(b, vie9, { esAdmin }))).toBe('ANTICIPACION_INSUFICIENTE');
  }
});

test('ni el admin agenda en el pasado ni en un festivo', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-16' });
  await insertarSemana(conn, { fecha_inicio: '2026-12-07' });
  expect(await motivo(agendar(b, new Date('2026-11-20T13:00:00Z'), { esAdmin: true }))).toBe('ANTICIPACION_INSUFICIENTE'); // ahora mismo
  expect(await motivo(agendar(b, new Date('2026-11-16T14:00:00Z'), { esAdmin: true }))).toBe('ANTICIPACION_INSUFICIENTE'); // pasado
  expect(await motivo(agendar(b, new Date('2026-12-08T14:00:00Z'), { esAdmin: true }))).toBe('FUERA_DE_VENTANA'); // festivo futuro (Inmaculada)
});

test('beneficiario inactivo o inexistente → VALIDACION, y no queda nada escrito', async () => {
  const b = await insertarBeneficiario(conn, { activo: 0 });
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  expect(await motivo(agendar(b, lun9, { esAdmin: true }))).toBe('VALIDACION');
  expect(await motivo(agendar(999999, lun9, { esAdmin: true }))).toBe('VALIDACION');
  expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 0 }]);
});

test('inicio que no es una fecha válida → FUERA_DE_VENTANA (nunca un 500)', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  for (const inicio of ['no-es-fecha', null, undefined, {}, '2026-11-23T09:00']) {
    expect(await motivo(agendar(b, inicio))).toBe('FUERA_DE_VENTANA');
  }
});

test('sin actor → error de programación, no se escribe nada', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  expect(await motivo(agendar(b, lun9, { actor: '' }))).toBe('ACTOR_REQUERIDO');
});

test('un fallo al encolar el outbox revierte la cita (la reserva y sus avisos son atómicos)', async () => {
  const b = await insertarBeneficiario(conn);
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
  const { citas: conOutboxRoto } = crearServicios({
    bd, obtenerConfig: configDePrueba, reloj: () => ahora, outbox: { encolar: async () => { throw new Error('outbox caído'); } },
  });
  await expect(conOutboxRoto.agendar({ beneficiarioId: b, inicio: lun9, actor: 'x', esAdmin: false })).rejects.toThrow('outbox caído');
  expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 0 }]);
  expect(await filas('SELECT COUNT(*) AS n FROM msj_cita_historial')).toEqual([{ n: 0 }]);
});
