const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, calificar } = require('../../testing/fabricas');
const db = require('../../../models');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(limpiar);
afterAll(cerrar);

test('TRK-RUB-001 devuelve criterios de la rúbrica de la categoría con máximo y descripción (HU-8 CA2)', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const fam = await categoria('FAMILIAR');
  const r = await request(servidor).get(`/api/trk/v1/rubricas/${fam.id}`).set('Authorization', `Bearer ${jurado.token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-RUB-001');
  const enBd = await db.TrkCriterio.findAll({ where: { rubrica_id: fam.rubrica_id }, order: [['orden', 'ASC']] });
  expect(r.body.data.criterios.map((c) => [c.codigo, c.puntaje_max])).toEqual(enBd.map((c) => [c.codigo, c.puntaje_max]));
  expect(r.body.data.criterios[0].descripcion).toEqual(expect.any(String));
  expect(r.body.data.puntaje_total_max).toBe(enBd.reduce((s, c) => s + c.puntaje_max, 0));
});

test('admin también puede ver la rúbrica; cabina no', async () => {
  const admin = await crearAdmin();
  const cabina = await crearOperativo('TRK_CABINA');
  const cat = await categoria('PEQ_MED');
  expect((await request(servidor).get(`/api/trk/v1/rubricas/${cat.id}`).set('Authorization', `Bearer ${admin.token}`)).status).toBe(200);
  expect((await request(servidor).get(`/api/trk/v1/rubricas/${cat.id}`).set('Authorization', `Bearer ${cabina.token}`)).status).toBe(403);
});

test('TRK-CAL-001 cada jurado ve solo sus calificaciones (R8)', async () => {
  const j1 = await crearOperativo('TRK_JURADO');
  const j2 = await crearOperativo('TRK_JURADO');
  const a = await crearParticipante({ estado: 'PRESENTADO' });
  const b = await crearParticipante({ estado: 'PRESENTADO' });
  const max = { CREATIVIDAD: 10, SEGURIDAD: 10, ELABORACION: 10, PASARELA: 10 };
  await calificar(a, j1.usuario, max);
  await calificar(b, j2.usuario, max);
  const r = await request(servidor).get('/api/trk/v1/calificaciones/mias').set('Authorization', `Bearer ${j1.token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-001');
  expect(r.body.data.map((c) => c.participante_id)).toEqual([a.id]);
});
