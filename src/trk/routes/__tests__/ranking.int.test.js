const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, calificar, criteriosDe } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
let admin; let jurados; let cat; let eventos;
const escuchar = (e) => eventos.push(e);

beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  jurados = [];
  for (const n of [1, 2, 3]) jurados.push(await crearOperativo('TRK_JURADO', { nombre: `J${n}` }));
  cat = await categoria('PEQ_MED');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

const comoAdmin = (r) => r.set('Authorization', `Bearer ${admin.token}`);
const puntos = (c, s, e, p) => ({ CREATIVIDAD: c, SEGURIDAD: s, ELABORACION: e, PASARELA: p });
async function calificadoPorTodos(nombre, valores) {
  const p = await crearParticipante({ mascota_nombre: nombre, estado: 'PRESENTADO' });
  for (const j of jurados) await calificar(p, j.usuario, valores);
  return p;
}

test('TRK-RNK-001 admin ve el ranking en vivo con promedios, completitud y calificaciones por jurado', async () => {
  const a = await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  const b = await crearParticipante({ mascota_nombre: 'B', estado: 'PRESENTADO' });
  await calificar(b, jurados[0].usuario, puntos(35, 30, 20, 15));
  const r = await comoAdmin(request(servidor).get(`/api/trk/v1/ranking/${cat.id}`));
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-RNK-001');
  expect(r.body.data.filas.map((f) => [f.mascota_nombre, f.puesto, f.completa])).toEqual([['A', 1, true], ['B', null, false]]);
  const filaA = r.body.data.filas[0];
  expect(filaA.calificaciones.map((c) => c.jurado_nombre).sort()).toEqual(['J1', 'J2', 'J3']);
  expect(filaA.participante).toMatchObject({ id: a.id, mascota_nombre: 'A' });
  expect(filaA.participante).not.toHaveProperty('responsable_telefono');
});

test('R8: sin publicar, jurado o público reciben 404 RANKING_NO_PUBLICADO', async () => {
  await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  const publico = await request(servidor).get(`/api/trk/v1/ranking/${cat.id}`);
  expect(publico.status).toBe(404);
  expect(publico.body.motivo).toBe('RANKING_NO_PUBLICADO');
  const comoJurado = await request(servidor).get(`/api/trk/v1/ranking/${cat.id}`).set('Authorization', `Bearer ${jurados[0].token}`);
  expect(comoJurado.status).toBe(404);
});

test('publicar con empate sin resolver → 409; TRK-RNK-002 lo resuelve y TRK-CAT-003 publica', async () => {
  const a = await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  const b = await calificadoPorTodos('B', puntos(30, 25, 10, 15));
  const bloqueado = await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/publicar`));
  expect(bloqueado.status).toBe(409);
  expect(bloqueado.body).toMatchObject({ error: 'TRK-CAT-003', motivo: 'EMPATE_SIN_RESOLVER' });

  const des = await comoAdmin(request(servidor).put(`/api/trk/v1/ranking/${cat.id}/desempate`)).send({ orden: [b.id, a.id] });
  expect(des.status).toBe(200);
  expect(des.headers['x-trk-api']).toBe('TRK-RNK-002');
  expect(des.body.data.filas.map((f) => f.mascota_nombre)).toEqual(['B', 'A']);

  const pub = await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/publicar`));
  expect(pub.status).toBe(200);
  expect(eventos.some((e) => e.evento === 'ranking:publicado' && e.payload.categoria_id === cat.id)).toBe(true);
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-RNK-002' } })).toBe(1);
});

test('lo publicado no cambia si luego se modifica una calificación (snapshot §8.1); sin calificaciones por jurado', async () => {
  const a = await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/publicar`)).expect(200);
  await db.TrkCalificacion.update({ total: 1 }, { where: { participante_id: a.id } });
  const publico = await request(servidor).get(`/api/trk/v1/ranking/${cat.id}`);
  expect(publico.status).toBe(200);
  expect(publico.body.data.filas[0].puntaje_final).toBe(80);
  expect(publico.body.data.filas[0]).not.toHaveProperty('calificaciones');
  const vivo = await comoAdmin(request(servidor).get(`/api/trk/v1/ranking/${cat.id}`));
  expect(vivo.body.data.filas[0].puntaje_final).toBe(1);
});

test('TRK-CAT-002 cerrar impide calificar; TRK-CAT-001 reabrir lo permite (HU-4 CA1)', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const ps = (await criteriosDe(p)).map((c) => ({ criterio_id: c.id, puntaje: 0 }));
  expect((await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/cerrar`))).body.data.abierta).toBe(false);
  const intento = await request(servidor).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${jurados[0].token}`).send({ puntajes: ps });
  expect(intento.body.motivo).toBe('CATEGORIA_CERRADA');
  expect((await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/abrir`))).body.data.abierta).toBe(true);
  expect((await request(servidor).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${jurados[0].token}`).send({ puntajes: ps })).status).toBe(200);
});

test('TRK-CAT-004 puestos premiados configurables', async () => {
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) await calificadoPorTodos(n, puntos(30 - i, 20, 10, 10));
  const r = await comoAdmin(request(servidor).patch(`/api/trk/v1/categorias/${cat.id}`)).send({ puestos_premiados: 4 });
  expect(r.status).toBe(200);
  expect(r.body.data.puestos_premiados).toBe(4);
  const vivo = await comoAdmin(request(servidor).get(`/api/trk/v1/ranking/${cat.id}`));
  expect(vivo.body.data.filas.filter((f) => f.premiado)).toHaveLength(4);
});

test('desactivar un jurado completa a quien tenía 2 de 3 (R4 sobre jurados activos)', async () => {
  const p = await crearParticipante({ mascota_nombre: 'P', estado: 'PRESENTADO' });
  await calificar(p, jurados[0].usuario, puntos(10, 10, 10, 10));
  await calificar(p, jurados[1].usuario, puntos(10, 10, 10, 10));
  await jurados[2].usuario.update({ activo: false });
  const vivo = await comoAdmin(request(servidor).get(`/api/trk/v1/ranking/${cat.id}`));
  expect(vivo.body.data.filas[0]).toMatchObject({ completa: true, puesto: 1 });
});

test('estado público en modo RANKING incluye el ranking publicado (HU-9 CA2)', async () => {
  await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  await comoAdmin(request(servidor).post(`/api/trk/v1/categorias/${cat.id}/publicar`)).expect(200);
  await comoAdmin(request(servidor).put('/api/trk/v1/evento/pantalla')).send({ modo: 'RANKING', categoria_id: cat.id }).expect(200);
  const r = await request(servidor).get('/api/trk/v1/evento/estado');
  expect(r.body.data.ranking.filas[0]).toMatchObject({ mascota_nombre: 'A', puesto: 1 });
});

test('sin permisos: jurado no publica ni cierra', async () => {
  expect((await request(servidor).post(`/api/trk/v1/categorias/${cat.id}/publicar`).set('Authorization', `Bearer ${jurados[0].token}`)).status).toBe(403);
  expect((await request(servidor).post(`/api/trk/v1/categorias/${cat.id}/cerrar`).set('Authorization', `Bearer ${jurados[0].token}`)).status).toBe(403);
});

test('M1: TRK-RNK-002 bloquea trk_evento_estado (id=1) antes que los participantes (orden evento → participantes)', async () => {
  const a = await calificadoPorTodos('A', puntos(30, 25, 15, 10));
  const b = await calificadoPorTodos('B', puntos(30, 25, 10, 15));
  const bloqueos = [];
  const origEstado = db.TrkEventoEstado.findByPk;
  const origPart = db.TrkParticipante.findAll;
  const sEstado = jest.spyOn(db.TrkEventoEstado, 'findByPk').mockImplementation(function (...args) {
    if (args[1] && args[1].lock) bloqueos.push(`evento:${args[0]}`);
    return origEstado.apply(this, args);
  });
  const sPart = jest.spyOn(db.TrkParticipante, 'findAll').mockImplementation(function (...args) {
    if (args[0] && args[0].lock) bloqueos.push('participantes');
    return origPart.apply(this, args);
  });
  try {
    await comoAdmin(request(servidor).put(`/api/trk/v1/ranking/${cat.id}/desempate`)).send({ orden: [b.id, a.id] }).expect(200);
  } finally {
    sEstado.mockRestore();
    sPart.mockRestore();
  }
  expect(bloqueos.slice(0, 2)).toEqual(['evento:1', 'participantes']);
});
