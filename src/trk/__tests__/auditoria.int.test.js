const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const db = require('../../models');
const { crearAppTrk } = require('../testing/app');
const { limpiar, cerrar } = require('../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, criteriosDe } = require('../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(limpiar);
afterAll(cerrar);

test('RNF-6: crear, desbloquear y reenviar calificación, cambiar categoría y fusionar quedan auditados con quién, qué, antes, después y código', async () => {
  const admin = await crearAdmin();
  const jurado = await crearOperativo('TRK_JURADO');
  const cabina = await crearOperativo('TRK_CABINA');
  const comoAdmin = (r) => r.set('Authorization', `Bearer ${admin.token}`);
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const ps = (await criteriosDe(p)).map((c) => ({ criterio_id: c.id, puntaje: 1 }));

  const cal = (await request(servidor).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${jurado.token}`).send({ puntajes: ps }).expect(200)).body.data;
  await comoAdmin(request(servidor).post(`/api/trk/v1/calificaciones/${cal.id}/desbloquear`)).expect(200);
  await request(servidor).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${jurado.token}`).send({ puntajes: ps.map((x) => ({ ...x, puntaje: 2 })) }).expect(200);

  const grandes = await categoria('GRANDES');
  await request(servidor).patch(`/api/trk/v1/participantes/${p.id}`).set('Authorization', `Bearer ${cabina.token}`).send({ categoria_id: grandes.id }).expect(200);
  await comoAdmin(request(servidor).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({ confirmar: true }).expect(200);

  const otro = await crearParticipante({ estado: 'PRESENTE', categoriaCodigo: 'GRANDES' });
  await comoAdmin(request(servidor).post(`/api/trk/v1/participantes/${otro.id}/fusionar`)).send({ destino_id: p.id }).expect(200);

  const filas = await db.TrkAuditoria.findAll({ order: [['id', 'ASC']] });
  const resumen = filas.map((a) => `${a.api_codigo}:${a.accion}`);
  expect(resumen).toEqual(expect.arrayContaining([
    'TRK-CAL-002:CREAR', 'TRK-CAL-003:DESBLOQUEAR', 'TRK-CAL-002:REENVIAR',
    'TRK-PAR-004:PROPONER_CATEGORIA', 'TRK-PAR-007:CAMBIAR_CATEGORIA', 'TRK-PAR-006:FUSIONAR'
  ]));
  for (const a of filas) {
    expect(a.api_codigo).toMatch(/^TRK-[A-Z]+-\d{3}$/);
    expect(a.usuario_id).toEqual(expect.any(Number));
    expect(a.created_at).toBeInstanceOf(Date);
  }
  const porAccion = (accion) => filas.filter((a) => a.accion === accion);
  const idsDe = (accion) => porAccion(accion).map((a) => a.usuario_id);
  expect(idsDe('CREAR')).toEqual([jurado.usuario.id]);
  expect(idsDe('REENVIAR')).toEqual([jurado.usuario.id]);
  for (const accion of ['DESBLOQUEAR', 'CAMBIAR_CATEGORIA', 'FUSIONAR']) { expect(idsDe(accion).length).toBeGreaterThan(0); expect(new Set(idsDe(accion))).toEqual(new Set([admin.usuario.id])); }
  expect(idsDe('PROPONER_CATEGORIA')).toEqual([cabina.usuario.id]);
  const reenvio = filas.find((a) => a.accion === 'REENVIAR');
  expect(reenvio.antes.total).not.toBe(reenvio.despues.total);
});
