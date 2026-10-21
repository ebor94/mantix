const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, criteriosDe } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
let admin; let jurado;
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  jurado = await crearOperativo('TRK_JURADO');
});
afterAll(cerrar);

const puntajes = async (p, k) => (await criteriosDe(p)).map((c) => ({ criterio_id: c.id, puntaje: Math.max(c.puntaje_max - k, 0) }));
const enviar = (p, ps) => request(servidor).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${jurado.token}`).send({ puntajes: ps });
const desbloquear = (id, quien = admin) => request(servidor).post(`/api/trk/v1/calificaciones/${id}/desbloquear`).set('Authorization', `Bearer ${quien.token}`);

test('§13.3 bloqueada → 409; tras desbloqueo del admin se permite modificar y queda auditado', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const cal = (await enviar(p, await puntajes(p, 1))).body.data;
  expect((await enviar(p, await puntajes(p, 3))).status).toBe(409);

  const r = await desbloquear(cal.id);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-003');
  expect(r.body.data.bloqueada).toBe(false);

  const nuevos = await puntajes(p, 3);
  const reenvio = await enviar(p, nuevos);
  expect(reenvio.status).toBe(200);
  expect(reenvio.body.data).toMatchObject({ bloqueada: true, total: nuevos.reduce((s, x) => s + x.puntaje, 0) });

  const acciones = (await db.TrkAuditoria.findAll({ where: { entidad: 'calificacion', entidad_id: String(cal.id) }, order: [['id', 'ASC']] }))
    .map((a) => [a.accion, a.api_codigo]);
  expect(acciones).toEqual([['CREAR', 'TRK-CAL-002'], ['DESBLOQUEAR', 'TRK-CAL-003'], ['REENVIAR', 'TRK-CAL-002']]);
  const desb = await db.TrkAuditoria.findOne({ where: { accion: 'DESBLOQUEAR' } });
  expect(desb.usuario_id).toBe(admin.usuario.id);
  expect(desb.antes).toMatchObject({ bloqueada: true });
});

test('solo el admin desbloquea (R7)', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const cal = (await enviar(p, await puntajes(p, 1))).body.data;
  expect((await desbloquear(cal.id, jurado)).status).toBe(403);
});

test('desbloquear una no bloqueada → 409 NO_BLOQUEADA', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const cal = (await enviar(p, await puntajes(p, 1))).body.data;
  await desbloquear(cal.id);
  const r = await desbloquear(cal.id);
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('NO_BLOQUEADA');
});
