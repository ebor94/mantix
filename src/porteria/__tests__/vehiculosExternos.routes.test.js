// src/porteria/__tests__/vehiculosExternos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/vehiculos-externos';
const guarda = () => tokenDe();
const admin = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });
const enviar = async (prueba, metodo, ruta, token, cuerpo) => request(await servir(prueba.app))[metodo](`${BASE}${ruta}`)
  .set('Authorization', `Bearer ${token}`).send(cuerpo);

test('buscar', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.vehiculosExternos.buscar.mockResolvedValue([{ placa: 'XYZ1' }]);
  const r = await request(await servir(prueba.app)).get(`${BASE}?q=%20flor%20`).set('Authorization', `Bearer ${guarda()}`);
  expect(r.headers['x-por-api']).toBe('POR-VEX-001');
  expect(r.body.data).toEqual([{ placa: 'XYZ1' }]);
  expect(prueba.deps.vehiculosExternos.buscar).toHaveBeenCalledWith('flor');
});

describe('crear', () => {
  test('el guarda crea; la placa se normaliza', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.vehiculosExternos.crear.mockResolvedValue(12);
    prueba.deps.vehiculosExternos.obtenerPorId.mockResolvedValue({ id: 12, placa: 'XYZ123' });
    const r = await enviar(prueba, 'post', '', guarda(), { placa: 'xyz-123', tipo: 'PROVEEDOR', empresa: ' Flores ', descripcion: '' });
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: 12, placa: 'XYZ123' });
    expect(prueba.deps.vehiculosExternos.crear).toHaveBeenCalledWith({ placa: 'XYZ123', tipo: 'PROVEEDOR', empresa: 'Flores', descripcion: null, usuario: 'guarda1' });
  });

  test('una placa de la empresa no entra al catálogo', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.h360.obtenerVehiculoPropioPorPlaca.mockResolvedValue({ id: 1, placa: 'ABC123' });
    const r = await enviar(prueba, 'post', '', guarda(), { placa: 'ABC123', tipo: 'PROVEEDOR', empresa: 'X' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'POR-VEX-002', motivo: 'PLACA_PROPIA', message: 'La placa es de un vehículo de la empresa' });
    expect(prueba.deps.vehiculosExternos.crear).not.toHaveBeenCalled();
  });

  test.each([
    [{ placa: '-', tipo: 'PROVEEDOR', empresa: 'X' }, 'Indica la placa'],
    [{ placa: 'A'.repeat(21), tipo: 'PROVEEDOR', empresa: 'X' }, 'La placa es demasiado larga'],
    [{ placa: 'A1', tipo: 'PROPIO', empresa: 'X' }, 'Tipo de vehículo inválido'],
    [{ placa: 'A1', tipo: 'PROVEEDOR', empresa: ' ' }, 'Indica la empresa'],
  ])('%p → 400 %s', async (cuerpo, message) => {
    const r = await enviar(crearAppPrueba(), 'post', '', guarda(), cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ motivo: 'VALIDACION', message });
  });
});

describe('actualizar', () => {
  test('solo el admin', async () => {
    const r = await enviar(crearAppPrueba(), 'patch', '/3', guarda(), { activo: false });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'POR-VEX-003', motivo: 'SIN_PERMISO' });
  });

  test('el admin actualiza; inexistente → 404; sin cambios → 400', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.vehiculosExternos.obtenerPorId.mockResolvedValue({ id: 3, activo: false });
    const r = await enviar(prueba, 'patch', '/3', admin(), { activo: false, empresa: 'Nueva' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: 3, activo: false });
    expect(prueba.deps.vehiculosExternos.actualizar).toHaveBeenCalledWith(3, { activo: false, empresa: 'Nueva' }, 'admin1');
    prueba.deps.vehiculosExternos.actualizar.mockResolvedValue(false);
    expect((await enviar(prueba, 'patch', '/4', admin(), { activo: true })).status).toBe(404);
    expect((await enviar(prueba, 'patch', '/3', admin(), {})).status).toBe(400);
  });
});
