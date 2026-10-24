const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
let admin; let eventos;
const escuchar = (e) => eventos.push(e);
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

const pantalla = (body) => request(servidor).put('/api/trk/v1/evento/pantalla').set('Authorization', `Bearer ${admin.token}`).send(body);

test('TRK-EVT-002 modo RANKING exige ranking publicado', async () => {
  const cat = await categoria('FELINOS');
  const r = await pantalla({ modo: 'RANKING', categoria_id: cat.id });
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ error: 'TRK-EVT-002', motivo: 'RANKING_NO_PUBLICADO' });
  await cat.update({ ranking_publicado: true });
  const ok = await pantalla({ modo: 'RANKING', categoria_id: cat.id });
  expect(ok.status).toBe(200);
  expect(ok.body.data).toMatchObject({ modo_pantalla: 'RANKING', categoria_pantalla: { id: cat.id, codigo: 'FELINOS', nombre: 'Felinos', color: '#186EDD' } });
  expect(eventos.some((e) => e.evento === 'pantalla:modo' && e.payload.modo_pantalla === 'RANKING')).toBe(true);
});

test('volver a modo PASARELA limpia la categoría', async () => {
  const r = await pantalla({ modo: 'PASARELA' });
  expect(r.body.data).toMatchObject({ modo_pantalla: 'PASARELA', categoria_pantalla: null });
});

test('TRK-EVT-003 tablero: contadores por estado y progreso por jurado', async () => {
  const j1 = await crearOperativo('TRK_JURADO', { nombre: 'J1' });
  await crearOperativo('TRK_JURADO', { nombre: 'J2' });
  const a = await crearParticipante({ estado: 'PRESENTADO' });
  await crearParticipante({ estado: 'EN_PASARELA' });
  await crearParticipante({ estado: 'INSCRITO', categoriaCodigo: 'GRANDES' });
  await db.TrkCalificacion.create({ participante_id: a.id, jurado_id: j1.usuario.id, total: 70, enviada_at: new Date(), bloqueada: true });
  const r = await request(servidor).get('/api/trk/v1/evento/tablero').set('Authorization', `Bearer ${admin.token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-EVT-003');
  const peq = r.body.data.categorias.find((c) => c.codigo === 'PEQUENOS');
  expect(peq).toMatchObject({ color: '#FD7218', total: 2, por_estado: { PRESENTADO: 1, EN_PASARELA: 1, INSCRITO: 0 } });
  expect(r.body.data.calificables).toBe(2);
  expect(r.body.data.jurados.map((j) => [j.nombre, j.calificadas, j.pendientes])).toEqual([['J1', 1, 1], ['J2', 0, 2]]);
});

test('sin permiso administrar → 403', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const r = await request(servidor).get('/api/trk/v1/evento/tablero').set('Authorization', `Bearer ${jurado.token}`);
  expect(r.status).toBe(403);
});
