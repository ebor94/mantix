const request = require('supertest');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
let comentarista; let jurado; let eventos;
const escuchar = (e) => eventos.push(e);

beforeEach(async () => {
  await limpiar();
  comentarista = await crearOperativo('TRK_COMENTARISTA');
  jurado = await crearOperativo('TRK_JURADO');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

const llamar = (id, quien = comentarista) => request(app).post(`/api/trk/v1/pasarela/${id}`).set('Authorization', `Bearer ${quien.token}`);

test('TRK-PAS-001 pone en pasarela, la anterior pasa a PRESENTADO y se emite el cambio (HU-7 CA1)', async () => {
  const a = await crearParticipante({ mascota_nombre: 'A' });
  const b = await crearParticipante({ mascota_nombre: 'B' });
  expect((await llamar(a.id)).status).toBe(200);
  const r = await llamar(b.id);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-PAS-001');
  expect(r.body.data.estado).toBe('EN_PASARELA');
  expect(r.body.data).not.toHaveProperty('responsable_telefono');
  await a.reload();
  expect(a.estado).toBe('PRESENTADO');
  const estado = await db.TrkEventoEstado.findByPk(1);
  expect(estado.participante_en_pasarela_id).toBe(b.id);
  const cambio = eventos.filter((e) => e.evento === 'pasarela:cambio').pop();
  expect(cambio.payload).toMatchObject({ participante: { id: b.id }, anteriores: [a.id] });
});

test('§13.14 llamadas concurrentes → exactamente una mascota EN_PASARELA', async () => {
  const ps = await Promise.all([1, 2, 3, 4].map((n) => crearParticipante({ mascota_nombre: `P${n}` })));
  const rs = await Promise.all(ps.map((p) => llamar(p.id)));
  rs.forEach((r) => expect(r.status).toBe(200));
  expect(await db.TrkParticipante.count({ where: { estado: 'EN_PASARELA' } })).toBe(1);
  expect(await db.TrkParticipante.count({ where: { estado: 'PRESENTADO' } })).toBe(3);
});

test('llamadas y reordenamientos concurrentes de una categoría no provocan deadlock (3 + 3 → 200, una EN_PASARELA)', async () => {
  const cat = await categoria('PEQ_MED');
  const ps = await Promise.all([1, 2, 3].map((n) => crearParticipante({ mascota_nombre: `D${n}`, orden_pasarela: n })));
  const orden = ps.map((p) => p.id);
  const reordenar = () => request(app).put('/api/trk/v1/pasarela/orden').set('Authorization', `Bearer ${comentarista.token}`)
    .send({ categoria_id: cat.id, orden: [...orden].reverse() });
  const rs = await Promise.all([
    ...ps.map((p) => llamar(p.id)),
    reordenar(), reordenar(), reordenar()
  ]);
  rs.forEach((r) => expect(r.status).toBe(200));
  expect(await db.TrkParticipante.count({ where: { estado: 'EN_PASARELA' } })).toBe(1);
});

test('una mascota INSCRITA (sin pasar por cabina) no puede salir → 409 ESTADO_INVALIDO', async () => {
  const p = await crearParticipante({ estado: 'INSCRITO' });
  const r = await llamar(p.id);
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ error: 'TRK-PAS-001', motivo: 'ESTADO_INVALIDO' });
});

test('un jurado no controla la pasarela → 403', async () => {
  const p = await crearParticipante();
  expect((await llamar(p.id, jurado)).status).toBe(403);
});

test('TRK-PAS-002 reordena la cola de una categoría (HU-7 CA3)', async () => {
  const cat = await categoria('PEQ_MED');
  const a = await crearParticipante({ mascota_nombre: 'A', orden_pasarela: 1 });
  const b = await crearParticipante({ mascota_nombre: 'B', orden_pasarela: 2 });
  const c = await crearParticipante({ mascota_nombre: 'C', orden_pasarela: 3 });
  const r = await request(app).put('/api/trk/v1/pasarela/orden').set('Authorization', `Bearer ${comentarista.token}`)
    .send({ categoria_id: cat.id, orden: [c.id, a.id, b.id] });
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-PAS-002');
  expect(r.body.data.map((p) => p.mascota_nombre)).toEqual(['C', 'A', 'B']);
  expect(eventos.some((e) => e.evento === 'participante:actualizado' && e.payload.categoria_id === cat.id)).toBe(true);
});

test('reordenar con un participante de otra categoría → 400', async () => {
  const cat = await categoria('PEQ_MED');
  const a = await crearParticipante();
  const otro = await crearParticipante({ categoriaCodigo: 'GRANDES' });
  const r = await request(app).put('/api/trk/v1/pasarela/orden').set('Authorization', `Bearer ${comentarista.token}`)
    .send({ categoria_id: cat.id, orden: [a.id, otro.id] });
  expect(r.status).toBe(400);
});

test('TRK-EVT-001 estado público sin sesión, sin datos personales', async () => {
  const p = await crearParticipante({ mascota_nombre: 'Canela' });
  await llamar(p.id);
  const r = await request(app).get('/api/trk/v1/evento/estado');
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-EVT-001');
  expect(r.body.data).toMatchObject({ modo_pantalla: 'PASARELA', categoria_pantalla: null, ranking: null, en_pasarela: { id: p.id, mascota_nombre: 'Canela' } });
  expect(r.body.data.en_pasarela).not.toHaveProperty('responsable_documento');
});
