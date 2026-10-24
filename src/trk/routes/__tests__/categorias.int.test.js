const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(limpiar);
afterAll(cerrar);

test('TRK-CAT-005 lista categorías en orden para cualquier sesión TRK', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const r = await request(servidor).get('/api/trk/v1/categorias').set('Authorization', `Bearer ${jurado.token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAT-005');
  expect(r.body.data.map((c) => [c.codigo, c.nombre, c.color, c.orden, c.rubrica_codigo])).toEqual([
    ['MEDIANOS', 'Caninos raza mediana', '#4C9F43', 1, 'INDIVIDUAL'],
    ['PEQUENOS', 'Caninos raza pequeña', '#FD7218', 2, 'INDIVIDUAL'],
    ['FELINOS', 'Felinos', '#186EDD', 3, 'INDIVIDUAL'],
    ['GRANDES', 'Caninos raza grande', '#FED104', 4, 'INDIVIDUAL'],
    ['FAMILIAR', 'Disfraz familiar', '#DA1F12', 5, 'FAMILIAR']
  ]);
  expect(r.body.data[0]).toMatchObject({ abierta: true, ranking_publicado: false, puestos_premiados: 3 });
});

test('sin sesión → 401', async () => {
  expect((await request(servidor).get('/api/trk/v1/categorias')).status).toBe(401);
});
