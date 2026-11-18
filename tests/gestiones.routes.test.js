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

const PROSPECTOS = {
  100: { prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }, // del asesor 10
  101: { prosp_id: 101, prosp_asesor_id: 11, prosp_grupo_id: 1, prosp_area_id: 1 }, // de otro asesor, mismo grupo
  200: { prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }  // de otro grupo
};

const GESTION = { gest_prosp_id: 100, gest_canal: 'llamada', gest_comentario: 'Llamada de seguimiento' };

function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/gestiones', require('../src/sv/routes/gestiones.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

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
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(201);
    expect(prospectos.obtenerAlcance).toHaveBeenCalledWith(100);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 100 }), 10);
  });

  test('asesor sobre el prospecto de otro asesor → 403 y no registra', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('supervisor sobre un prospecto de su grupo → 201 a nombre del supervisor', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(201);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 101 }), 20);
  });

  test('supervisor sobre un prospecto de otro grupo → 403 y no registra', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 200 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu grupo' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('prospecto inexistente → 404 y no registra', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 999 });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Prospecto no encontrado' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });
});

describe('GET /api/sv/gestiones — historial', () => {
  test('historial de un prospecto propio → 200', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
    expect(r.status).toBe(200);
    expect(gestiones.historial).toHaveBeenCalledWith(100, { page: 1, limit: 20 });
  });

  test('historial de un prospecto ajeno → 403 y no consulta', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=101');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('supervisor: historial de otro grupo → 403', async () => {
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones?prosp_id=200');
    expect(r.status).toBe(403);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('historial de un prospecto inexistente → 404', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=999');
    expect(r.status).toBe(404);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });
});

describe('errores en POST y GET → next(e), el proceso sigue vivo', () => {
  test('POST: error al registrar → 500 del manejador de errores', async () => {
    gestiones.crear.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('INTERNAL_ERROR');
  });

  test('POST: error al cargar el prospecto → 500', async () => {
    prospectos.obtenerAlcance.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('GET: error al leer el historial → 500', async () => {
    gestiones.historial.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
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
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(10);
  });

  test('supervisor con gest_asesor_id de un asesor: queda a nombre del supervisor', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones')
      .send({ ...GESTION, gest_prosp_id: 101, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(20);
  });
});
