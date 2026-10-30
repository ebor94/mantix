// src/porteria/__tests__/catalogos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/catalogos';
const RUTAS = [
  ['/sedes', 'POR-CAT-001'],
  ['/vehiculos-propios', 'POR-CAT-002'],
  ['/conductores', 'POR-CAT-003'],
  ['/asistencias', 'POR-CAT-004'],
  ['/exequias', 'POR-CAT-005'],
  ['/motivos', 'POR-CAT-006'],
];

async function get(ruta, deps) {
  const { app } = deps ? { app: deps.app } : crearAppPrueba();
  return request(await servir(app)).get(`${BASE}${ruta}`).set('Authorization', `Bearer ${tokenDe()}`);
}

test.each(RUTAS)('%s exige sesión (%s)', async (ruta, codigo) => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get(`${BASE}${ruta}`);
  expect(r.status).toBe(401);
  expect(r.body.error).toBe(codigo);
});

test('sedes', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.listarSedes.mockResolvedValue([{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }]);
  const r = await get('/sedes', prueba);
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-CAT-001');
  expect(r.body).toEqual({ success: true, data: [{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }] });
});

test('vehículos propios pasa la búsqueda recortada', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.buscarVehiculosPropios.mockResolvedValue([{ id: 1, placa: 'ABC123' }]);
  const r = await get('/vehiculos-propios?q=%20abc%20', prueba);
  expect(r.body.data).toEqual([{ id: 1, placa: 'ABC123' }]);
  expect(prueba.deps.h360.buscarVehiculosPropios).toHaveBeenCalledWith('abc');
});

test('búsqueda vacía se pasa como undefined', async () => {
  const prueba = crearAppPrueba();
  await get('/asistencias?q=', prueba);
  expect(prueba.deps.h360.buscarAsistencias).toHaveBeenCalledWith(undefined);
});

test('búsqueda de más de 50 caracteres → 400', async () => {
  const r = await get(`/asistencias?q=${'a'.repeat(51)}`);
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ error: 'POR-CAT-004', motivo: 'VALIDACION', message: 'La búsqueda es demasiado larga' });
});

test('conductores', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.conductores.listar.mockResolvedValue([{ usuario: 'baez', nombre: 'Báez Luis' }]);
  const r = await get('/conductores', prueba);
  expect(r.body.data).toEqual([{ usuario: 'baez', nombre: 'Báez Luis' }]);
});

test('exequias recibe búsqueda y placa', async () => {
  const prueba = crearAppPrueba();
  await get('/exequias?placa=abc-123', prueba);
  expect(prueba.deps.h360.buscarExequias).toHaveBeenCalledWith({ q: undefined, placa: 'abc-123' });
});

test('motivos filtra por tipo y sentido', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.motivos.listarActivos.mockResolvedValue([{ id: 1, codigo: 'TANQUEO' }]);
  const r = await get('/motivos?tipo_vehiculo=PROPIO&sentido=SALIDA', prueba);
  expect(r.body.data).toEqual([{ id: 1, codigo: 'TANQUEO' }]);
  expect(prueba.deps.motivos.listarActivos).toHaveBeenCalledWith({ tipoVehiculo: 'PROPIO', sentido: 'SALIDA' });
});

test.each(['?tipo_vehiculo=CAMION', '?sentido=ARRIBA'])('motivos con %s → 400', async (query) => {
  const prueba = crearAppPrueba();
  const r = await get(`/motivos${query}`, prueba);
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ motivo: 'VALIDACION', message: 'Tipo de vehículo o sentido inválido' });
  expect(prueba.deps.motivos.listarActivos).not.toHaveBeenCalled();
});

test('un fallo de la BD responde 500 genérico', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.listarSedes.mockRejectedValue(Object.assign(new Error("Unknown column 'x'"), { code: 'ER_BAD_FIELD_ERROR' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = await get('/sedes', prueba);
  expect(r.status).toBe(500);
  expect(r.body).toEqual({ success: false, error: 'POR-CAT-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
  jest.restoreAllMocks();
});
