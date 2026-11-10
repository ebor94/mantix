const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana } = require('../testing/fabricas');
const { configDePrueba } = require('../testing/appPrueba');
const { crearServicios } = require('../services');
const { crearServicioRecordatorios } = require('../services/recordatorios.service');

let conn;
let bd;
let reloj;
let s;
let r;
const jue9 = new Date('2026-11-26T14:00:00Z'); // jueves 26 9:00 local
beforeAll(async () => { conn = await abrirConexion(); bd = crearBdDePrueba(); });
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  await limpiar(conn);
  reloj = new Date('2026-11-20T13:00:00Z');
  s = crearServicios({ bd, obtenerConfig: configDePrueba, reloj: () => reloj });
  r = crearServicioRecordatorios({ bd, obtenerConfig: configDePrueba, outbox: s.outbox });
  await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
});

const filas = async (sql, p = []) => (await conn.query(sql, p))[0];
const de = async (tipo) => (await filas('SELECT cita_id, canal, clave FROM msj_notificaciones WHERE tipo = ?', [tipo])).map((n) => `${n.cita_id}/${n.canal}`).sort();
async function cita(inicio, creadaEn = reloj) {
  const b = await insertarBeneficiario(conn);
  const c = await s.citas.agendar({ beneficiarioId: b, inicio, actor: 'e', esAdmin: true });
  await conn.execute('UPDATE msj_citas SET created_at = ? WHERE id = ?', [creadaEn, c.id]);
  return c;
}

test('recordatorio 2 días antes: email + sms para las citas agendadas de pasado mañana; repetirlo no duplica', async () => {
  const c = await cita(jue9);
  const otra = await cita(new Date('2026-11-27T14:00:00Z')); // viernes: no es pasado mañana
  const ahora = new Date('2026-11-24T12:00:00Z'); // martes 24 7:00 local
  expect(await r.encolarRecordatorios2d(ahora)).toEqual({ encoladas: 1 });
  expect(await r.encolarRecordatorios2d(ahora)).toEqual({ encoladas: 1 });
  expect(await de('recordatorio_2d')).toEqual([`${c.id}/email`, `${c.id}/sms`]);
  expect(await de('recordatorio_2d')).not.toContain(`${otra.id}/email`);
});

test('una cita creada con menos de 2 días de anticipación no recibe recordatorio_2d', async () => {
  await cita(jue9, new Date('2026-11-25T13:00:00Z')); // creada el 25 para el 26
  expect(await r.encolarRecordatorios2d(new Date('2026-11-24T12:00:00Z'))).toEqual({ encoladas: 0 });
});

test('citas canceladas no reciben recordatorios', async () => {
  const c = await cita(jue9);
  await s.citas.cancelar({ citaId: c.id, actor: 'admin', esAdmin: true, motivo: 'x' });
  expect(await r.encolarRecordatorios2d(new Date('2026-11-24T12:00:00Z'))).toEqual({ encoladas: 0 });
});

test('"¡Es hoy!": solo las citas agendadas de hoy (hora Colombia, aunque el servidor esté en UTC)', async () => {
  const hoy = await cita(jue9);
  await cita(new Date('2026-11-27T13:00:00Z')); // mañana 8:00
  // 26-nov 06:30 local = 11:30 UTC
  expect(await r.encolarEsHoy(new Date('2026-11-26T11:30:00Z'))).toEqual({ encoladas: 1 });
  expect(await de('es_hoy')).toEqual([`${hoy.id}/email`]);
});

test('"¡Es hoy!" corrido a mano de noche (21:00 Colombia = otro día en UTC) usa el día de Colombia', async () => {
  const hoy = await cita(new Date('2026-11-25T21:00:00Z')); // miércoles 25 16:00 local
  await cita(jue9); // jueves 26: en UTC ya sería "hoy"
  expect(await r.encolarEsHoy(new Date('2026-11-26T02:00:00Z'))).toEqual({ encoladas: 1 }); // 25-nov 21:00 local
  expect(await de('es_hoy')).toEqual([`${hoy.id}/email`]);
});

test('una cita reprogramada después de encolar: el recordatorio viejo queda descartado y el nuevo usa el nuevo inicio', async () => {
  const c = await cita(jue9);
  await r.encolarRecordatorios2d(new Date('2026-11-24T12:00:00Z'));
  reloj = new Date('2026-11-24T13:00:00Z');
  await s.citas.reprogramar({ citaId: c.id, inicio: new Date('2026-11-27T14:00:00Z'), actor: 'a', esAdmin: true });
  const n = await filas("SELECT estado, clave FROM msj_notificaciones WHERE tipo = 'recordatorio_2d'");
  expect(n.every((x) => x.estado === 'descartado')).toBe(true);
  await r.encolarRecordatorios2d(new Date('2026-11-25T12:00:00Z'));
  expect((await filas("SELECT clave FROM msj_notificaciones WHERE tipo = 'recordatorio_2d' AND estado = 'pendiente'")).map((x) => x.clave.split(':').slice(3).join(':')))
    .toEqual(['2026-11-27T14:00:00.000Z', '2026-11-27T14:00:00.000Z']);
});
