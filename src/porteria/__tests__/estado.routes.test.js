// src/porteria/__tests__/estado.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/estado';
const get = async (prueba, ruta, token) => request(await servir(prueba.app)).get(`${BASE}${ruta}`).set('Authorization', `Bearer ${token}`);

test('dentro: el guarda consulta su sede; el admin pide una', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.estado.dentro.mockResolvedValue([{ placa: 'ABC123' }]);
  const r = await get(prueba, '/dentro?sede_id=9', tokenDe({ sede: { id: 3, nombre: 'N' } }));
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-EST-001');
  expect(r.body.data).toEqual([{ placa: 'ABC123' }]);
  expect(prueba.deps.estado.dentro).toHaveBeenLastCalledWith(3);
  await get(prueba, '/dentro?sede_id=9', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.dentro).toHaveBeenLastCalledWith(9);
  const sinSede = await get(prueba, '/dentro', tokenDe({ rol: 'admin_porteria' }));
  expect(sinSede.status).toBe(400);
});

test('fuera: el guarda ve toda la flota; el admin puede filtrar por sede', async () => {
  const prueba = crearAppPrueba();
  await get(prueba, '/fuera?sede_id=9', tokenDe({ sede: { id: 3, nombre: 'N' } }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(null);
  await get(prueba, '/fuera', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(null);
  await get(prueba, '/fuera?sede_id=9', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(9);
});

test('placa: sugerencia', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.estado.sugerir.mockResolvedValue({ placa: 'ABC123', sentido_sugerido: 'INGRESO' });
  const r = await get(prueba, '/placa/abc-123', tokenDe());
  expect(r.headers['x-por-api']).toBe('POR-EST-003');
  expect(r.body.data).toEqual({ placa: 'ABC123', sentido_sugerido: 'INGRESO' });
  expect(prueba.deps.estado.sugerir).toHaveBeenCalledWith('abc-123');
});
