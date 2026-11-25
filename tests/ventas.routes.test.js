jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({}));
jest.mock('../src/sv/services/ventas.service', () => ({
  listarDeProspecto: jest.fn(), obtener: jest.fn(), corregir: jest.fn(), anular: jest.fn()
}));
jest.mock('../src/sv/services/prospectos.service', () => ({ obtenerAlcance: jest.fn() }));

const express = require('express');
const request = require('supertest');
const ventas = require('../src/sv/services/ventas.service');
const prospectos = require('../src/sv/services/prospectos.service');
const ctrl = require('../src/sv/controllers/ventas.controller');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const ASESOR     = { usr_id: 7, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const OTRO       = { ...ASESOR, usr_id: 8 };
const SUPERVISOR = { usr_id: 3, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR' } };
const AJENO      = { ...SUPERVISOR, usr_id: 4, usr_grupo_id: 2 };
const ADMIN      = { usr_id: 5, usr_area_id: 1, areasExtra: [], rol: { rol_codigo: 'ADMIN_AREA' } };
const ADMIN_OTRA = { ...ADMIN, usr_id: 6, usr_area_id: 2 };
// Cross-área: solo las ventas de sus áreas (SUPER_ADMIN, todas). El cliente 900 es del área 1.
const jefe = (rol, usr_id, usr_area_id, extras = []) => ({ usr_id, usr_area_id, areasExtra: extras.map((area_id) => ({ area_id })), rol: { rol_codigo: rol } });
const GERENTE      = jefe('GERENTE_GENERAL', 60, 2, [1, 3]);
const GERENTE_SIN  = jefe('GERENTE_GENERAL', 61, 2, [3, 4]);
const DIRECTOR     = jefe('DIRECTOR_COMERCIAL', 62, 3, [1]);
const DIRECTOR_SIN = jefe('DIRECTOR_COMERCIAL', 63, 3, [4]);
const SUPER        = jefe('SUPER_ADMIN', 64, null);
const AGENTE     = { ...ASESOR, rol: { rol_codigo: 'AGENTE_SVC' } }; // el cliente es suyo: solo lo frena el rol
const BODY = { items: [{ prod_id: 10, cantidad: 1, precio_unitario: 5 }], motivo: 'precio mal', cambios_vistos: 0 };

function app(user) {
  const r = express.Router();
  r.get('/prospectos/:id/ventas', ctrl.listarDeProspecto);
  r.use('/ventas', require('../src/sv/routes/ventas.routes'));
  capturarAsync(r);
  r.use(svErrorHandler);
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv', r);
  return escuchar(a);
}

beforeEach(() => {
  jest.resetAllMocks();
  prospectos.obtenerAlcance.mockImplementation(async (id) => (id === 900 ? { prosp_id: 900, prosp_asesor_id: 7, prosp_grupo_id: 1, prosp_area_id: 1 } : null));
  ventas.obtener.mockImplementation(async (id) => (id === 40 ? { venta_id: 40, venta_prosp_id: 900 } : null));
  ventas.listarDeProspecto.mockResolvedValue([{ venta_id: 40 }]);
  ventas.corregir.mockResolvedValue({ venta_id: 40, venta_total: '5.00' });
  ventas.anular.mockResolvedValue({ venta_id: 40, venta_anulada: 1 });
});
afterEach(cerrarTodos);

describe('ver las ventas del cliente', () => {
  test.each([
    ['su asesor', ASESOR, 900, 200], ['su supervisor', SUPERVISOR, 900, 200],
    ['un gerente con su área', GERENTE, 900, 200], ['un gerente sin su área', GERENTE_SIN, 900, 403],
    ['un director con su área', DIRECTOR, 900, 200], ['un director sin su área', DIRECTOR_SIN, 900, 403],
    ['el super administrador', SUPER, 900, 200],
    ['otro asesor', OTRO, 900, 403], ['un supervisor de otro grupo', AJENO, 900, 403],
    ['un cliente que no existe', ASESOR, 901, 404], ['un id inválido', ASESOR, 'abc', 404],
    ['900 en otra notación (9e2)', ASESOR, '9e2', 404], ['900 en hexadecimal (0x384)', ASESOR, '0x384', 404],
    ['900 con decimales', ASESOR, '900.0', 404], ['900 con signo', ASESOR, '+900', 404],
    ['900 con espacio', ASESOR, '%20900', 404], ['más de 10 cifras', ASESOR, '00000000900', 404], ['cero', ASESOR, '0', 404]
  ])('%s', async (_n, user, id, estado) => {
    const r = await request(await app(user)).get(`/api/sv/prospectos/${id}/ventas`);
    expect(r.status).toBe(estado);
    expect(ventas.listarDeProspecto).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
  });
});

test('gerente y director fuera de sus áreas: Fuera de tu área', async () => {
  for (const user of [GERENTE_SIN, DIRECTOR_SIN]) {
    const r = await request(await app(user)).get('/api/sv/prospectos/900/ventas');
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Fuera de tu área');
  }
});

describe.each([['corregir', 'put', '/ventas/40', BODY], ['anular', 'post', '/ventas/40/anular', { motivo: 'se cayó', cambios_vistos: 0 }]])('%s', (accion, metodo, ruta, body) => {
  const pedir = async (user, r = ruta, b = body) => request(await app(user))[metodo](`/api/sv${r}`).send(b);

  test('el supervisor del cliente puede, y queda a su nombre', async () => {
    const r = await pedir(SUPERVISOR);
    expect(r.status).toBe(200);
    expect(ventas[accion]).toHaveBeenCalledWith(40, body, 3);
  });

  test('el asesor no puede, aunque sea su cliente', async () => {
    const r = await pedir(ASESOR);
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Solo el supervisor puede corregir o anular una venta');
    expect(ventas[accion]).not.toHaveBeenCalled();
  });

  test('un supervisor de otro grupo no puede', async () => {
    expect((await pedir(AJENO)).status).toBe(403);
    expect(ventas[accion]).not.toHaveBeenCalled();
  });

  test('el administrador de su área puede; el de otra área no', async () => {
    expect((await pedir(ADMIN)).status).toBe(200);
    expect(ventas[accion]).toHaveBeenCalledTimes(1);
    const r = await pedir(ADMIN_OTRA);
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Fuera de tu área');
    expect(ventas[accion]).toHaveBeenCalledTimes(1);
  });

  test('gerente y director: solo con el área del cliente entre las suyas; el super administrador siempre', async () => {
    for (const user of [GERENTE, DIRECTOR, SUPER]) {
      ventas[accion].mockClear();
      expect((await pedir(user)).status).toBe(200);
      expect(ventas[accion]).toHaveBeenCalledTimes(1);
    }
    for (const user of [GERENTE_SIN, DIRECTOR_SIN]) {
      ventas[accion].mockClear();
      const r = await pedir(user);
      expect(r.status).toBe(403);
      expect(r.body.message).toBe('Fuera de tu área');
      expect(ventas[accion]).not.toHaveBeenCalled();
    }
  });

  test('el agente de SVC no puede, aunque sea su cliente', async () => {
    const r = await pedir(AGENTE);
    expect(r.status).toBe(403);
    expect(r.body.message).toBe('Solo el supervisor puede corregir o anular una venta');
    expect(ventas[accion]).not.toHaveBeenCalled();
  });

  test('una venta que no existe → 404', async () => {
    expect((await pedir(SUPERVISOR, ruta.replace('40', '41'))).status).toBe(404);
  });

  test.each(['abc', '4e1', '0x28', '40.0', '+40', '%2040', '00000000040', '0'])('un id inválido (%s) → 404, sin consultar', async (id) => {
    const r = await pedir(SUPERVISOR, ruta.replace('40', id));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('NOT_FOUND');
    expect(ventas.obtener).not.toHaveBeenCalled();
    expect(ventas[accion]).not.toHaveBeenCalled();
  });

  test('sin motivo → 422', async () => {
    expect((await pedir(SUPERVISOR, ruta, { ...body, motivo: '' })).status).toBe(422);
    expect(ventas[accion]).not.toHaveBeenCalled();
  });

  test('si otra persona la cambió → 409 con el mensaje', async () => {
    ventas[accion].mockRejectedValue(Object.assign(new Error('Otra persona cambió esta venta'), { code: 'CONFLICT' }));
    const r = await pedir(SUPERVISOR);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ success: false, error: 'CONFLICT', message: 'Otra persona cambió esta venta' });
  });
});
