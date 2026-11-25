/**
 * /api/sv/gestiones detrás del svAreaGuard real. Sin base de datos: servicios
 * y modelos simulados con jest.mock.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/models', () => ({ SvUsuario: { findAll: jest.fn() } }));
jest.mock('../src/sv/services/prospectos.service', () => ({ obtenerAlcance: jest.fn() }));
jest.mock('../src/sv/services/gestiones.service', () => ({
  crear: jest.fn(), historial: jest.fn(), resumenDia: jest.fn()
}));

const { SvUsuario } = require('../src/sv/models');
const prospectos = require('../src/sv/services/prospectos.service');
const gestiones  = require('../src/sv/services/gestiones.service');
const ctrl       = require('../src/sv/controllers/gestiones.controller');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

// Área 1, grupo 1. El asesor 11 es compañero de grupo del asesor 10.
const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR' } };

const jefe = (rol, usr_id, usr_area_id, extras = []) => ({ usr_id, usr_area_id, usr_grupo_id: null, areasExtra: extras.map((area_id) => ({ area_id })), rol: { rol_codigo: rol } });
const DIRECTOR = jefe('DIRECTOR_COMERCIAL', 40, 2, [3, 4]); // el prospecto 300 es del área 1
const DIRECTOR_CON = jefe('DIRECTOR_COMERCIAL', 41, 2, [1]);
const GERENTE  = jefe('GERENTE_GENERAL', 42, 1, [2, 3, 4]);
const SUPER    = jefe('SUPER_ADMIN', 43, null);

const PROSPECTOS = {
  300: { prosp_id: 300, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }, // de otro asesor, en el área 1
  100: { prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }, // del asesor 10
  101: { prosp_id: 101, prosp_asesor_id: 11, prosp_grupo_id: 1, prosp_area_id: 1 }, // de otro asesor, mismo grupo
  200: { prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }  // de otro grupo
};

const VENTA = { clave: 'clave-0001', items: [{ prod_id: 10, cantidad: 1, precio_unitario: 5 }] };
const GESTION = { gest_prosp_id: 100, gest_canal: 'llamada', gest_comentario: 'Llamada de seguimiento' };

// supertest 6 escucha en '::' y conecta a 127.0.0.1. En macOS ese puerto puede
// estar tomado en 127.0.0.1 por otro proceso (editores, agentes) y la petición
// le llega a él: 404 o ECONNRESET intermitentes. Por eso el servidor escucha
// explícitamente en 127.0.0.1 y se cierra al terminar cada prueba.
const servidores = [];

async function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/gestiones', require('../src/sv/routes/gestiones.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  const server = a.listen(0, '127.0.0.1');
  servidores.push(server);
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  return server;
}

afterEach(async () => {
  await Promise.all(servidores.splice(0).map(s => new Promise(resolve => s.close(resolve))));
});

// req armado a mano para llamar al controlador sin Express.
function reqDe(user, extra = {}) {
  const req = { user, body: {}, query: {}, params: {}, ...extra };
  svAreaGuard(req, {}, () => {});
  return req;
}
function resFalso() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  prospectos.obtenerAlcance.mockImplementation(async (id) => PROSPECTOS[id] || null);
  gestiones.crear.mockResolvedValue({ gest_id: 1 });
  gestiones.historial.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, hasMore: false });
  gestiones.resumenDia.mockResolvedValue({ total: 0, positivas: 0, llamadas: 0, presenciales: 0 });
  SvUsuario.findAll.mockResolvedValue([]);
});

describe('POST /api/sv/gestiones — alcance del prospecto', () => {
  test('asesor sobre su propio prospecto → 201 a nombre suyo', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(201);
    expect(prospectos.obtenerAlcance).toHaveBeenCalledWith(100);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 100 }), 10);
  });

  test('asesor sobre el prospecto de otro asesor → 403 y no registra', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('supervisor sobre un prospecto de su grupo → 201 a nombre del supervisor', async () => {
    const r = await request(await app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(201);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 101 }), 20);
  });

  test('supervisor sobre un prospecto de otro grupo → 403 y no registra', async () => {
    const r = await request(await app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 200 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu grupo' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('prospecto inexistente → 404 y no registra', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 999 });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Prospecto no encontrado' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });
});

describe('POST /api/sv/gestiones — con venta', () => {
  const crear = async (user, body) => request(await app(user)).post('/api/sv/gestiones').send(body);
  const conVenta = { ...GESTION, gest_prosp_id: 300, venta: VENTA };

  test('director fuera de sus áreas → 403 y no registra', async () => {
    const r = await crear(DIRECTOR, conVenta);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu área' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test.each([['director en su área', DIRECTOR_CON], ['gerente con las cuatro', GERENTE], ['super administrador', SUPER]])('%s → 201', async (_n, user) => {
    expect((await crear(user, conVenta)).status).toBe(201);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ venta: VENTA }), user.usr_id);
  });

  test('el mismo director fuera de sus áreas, sin venta → 201 como siempre', async () => {
    expect((await crear(DIRECTOR, { ...GESTION, gest_prosp_id: 300 })).status).toBe(201);
  });

  test('el asesor dueño con venta → 201', async () => {
    expect((await crear(ASESOR, { ...GESTION, venta: VENTA })).status).toBe(201);
  });
});

describe('GET /api/sv/gestiones — historial', () => {
  test('el historial no usa el alcance de ventas: director fuera de su área → 200', async () => {
    const r = await request(await app(DIRECTOR)).get('/api/sv/gestiones?prosp_id=300');
    expect(r.status).toBe(200);
    expect(gestiones.historial).toHaveBeenCalledWith(300, { page: 1, limit: 20 });
  });

  test('historial de un prospecto propio → 200', async () => {
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
    expect(r.status).toBe(200);
    expect(gestiones.historial).toHaveBeenCalledWith(100, { page: 1, limit: 20 });
  });

  test('historial de un prospecto ajeno → 403 y no consulta', async () => {
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones?prosp_id=101');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('supervisor: historial de otro grupo → 403', async () => {
    const r = await request(await app(SUPERVISOR)).get('/api/sv/gestiones?prosp_id=200');
    expect(r.status).toBe(403);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('historial de un prospecto inexistente → 404', async () => {
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones?prosp_id=999');
    expect(r.status).toBe(404);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });
});

describe('errores en POST y GET → next(e), el proceso sigue vivo', () => {
  test('POST: error al registrar → 500 del manejador de errores', async () => {
    gestiones.crear.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('INTERNAL_ERROR');
  });

  test('POST: error al cargar el prospecto → 500', async () => {
    prospectos.obtenerAlcance.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('GET: error al leer el historial → 500', async () => {
    gestiones.historial.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
    expect(r.status).toBe(500);
  });

  test('create: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.crear.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.create(reqDe(ASESOR, { body: { ...GESTION } }), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });

  test('list: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.historial.mockRejectedValue(err);
    const next = jest.fn();
    const req = reqDe(ASESOR, { query: { prosp_id: 100, page: 1, limit: 20 } });
    await expect(ctrl.list(req, resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('POST /api/sv/gestiones — gest_asesor_id', () => {
  test('asesor con gest_asesor_id ajeno: se descarta y la gestión queda a su nombre', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(10);
  });

  test('supervisor con gest_asesor_id de un asesor: queda a nombre del supervisor', async () => {
    const r = await request(await app(SUPERVISOR)).post('/api/sv/gestiones')
      .send({ ...GESTION, gest_prosp_id: 101, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(20);
  });
});

describe('GET /api/sv/gestiones/resumen-dia', () => {
  const SUPER_ADMIN = { usr_id: 1, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };

  test('asesor sin asesor_id → su propio resumen', async () => {
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(10, undefined);
  });

  test('asesor que pide el resumen de otro asesor → recibe el suyo', async () => {
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(10, undefined);
    expect(SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('supervisor con un asesor de su grupo → 200 con el resumen de ese asesor', async () => {
    SvUsuario.findAll.mockResolvedValue([{ usr_id: 10 }, { usr_id: 11 }, { usr_id: 20 }]);
    const r = await request(await app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(11, undefined);
  });

  test('supervisor con un asesor fuera de su grupo → 403 y no consulta', async () => {
    SvUsuario.findAll.mockResolvedValue([{ usr_id: 10 }, { usr_id: 11 }, { usr_id: 20 }]);
    const r = await request(await app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=30');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.resumenDia).not.toHaveBeenCalled();
  });

  test('supervisor sin asesor_id → su propio resumen, sin consultar usuarios', async () => {
    const r = await request(await app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(20, undefined);
    expect(SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN puede pedir el resumen de cualquier asesor', async () => {
    const r = await request(await app(SUPER_ADMIN)).get('/api/sv/gestiones/resumen-dia?asesor_id=30');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(30, undefined);
  });

  test('error del servicio → 500 del manejador de errores', async () => {
    gestiones.resumenDia.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(await app(ASESOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(500);
  });

  test('error al consultar usuarios accesibles → 500', async () => {
    SvUsuario.findAll.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(await app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(500);
    expect(gestiones.resumenDia).not.toHaveBeenCalled();
  });

  test('resumenDia: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.resumenDia.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.resumenDia(reqDe(ASESOR), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('POST /api/sv/gestiones — quitar_prox', () => {
  test('quitar_prox: true llega al servicio', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, quitar_prox: true });
    expect(r.status).toBe(201);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ quitar_prox: true }), 10);
  });

  test("quitar_prox: 'quizás' → 422 y no registra", async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, quitar_prox: 'quizás' });
    expect(r.status).toBe(422);
    expect(gestiones.crear).not.toHaveBeenCalled();
  });
});
