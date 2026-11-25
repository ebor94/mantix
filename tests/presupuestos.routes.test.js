jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  sequelize: { query: jest.fn() },
  SvUsuario: { findAll: jest.fn() },
  SvPresupuesto: { findAll: jest.fn(), findOne: jest.fn() },
  SvProducto: { findAll: jest.fn() }
}));

const express = require('express');
const request = require('supertest');
const M = require('../src/sv/models');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const quien = (rol, extra = {}) => ({ usr_id: 3, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], areasExtra: [], rol: { rol_codigo: rol }, ...extra });
const QUERY = { area_id: 1, anio: 2026, mes: 11 };

function app(user) {
  const r = express.Router();
  r.use('/presupuestos', require('../src/sv/routes/presupuestos.routes'));
  capturarAsync(r);
  r.use(svErrorHandler);
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv', r);
  return escuchar(a);
}
const pedir = async (user, query = QUERY) => request(await app(user)).get('/api/sv/presupuestos').query(query);

beforeEach(() => {
  jest.resetAllMocks();
  M.SvProducto.findAll.mockResolvedValue([{ prod_categoria: 'Osarios' }]);
  M.SvPresupuesto.findAll.mockResolvedValue([]);
  M.SvPresupuesto.findOne.mockResolvedValue(null);
  M.sequelize.query.mockResolvedValue([]);
  M.SvUsuario.findAll.mockResolvedValue([{ usr_id: 7, usr_nombre: 'Ana', usr_apellido: 'Pérez', usr_grupo_id: 1, usr_activo: 1, grupo: null }]);
});
afterEach(cerrarTodos);

describe('GET /presupuestos', () => {
  test('responde la forma de la especificación', async () => {
    const r = await pedir(quien('ADMIN_AREA'), { area_id: '1', anio: '2026', mes: '11' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data)).toEqual(['area_id', 'anio', 'mes', 'puede_cargar', 'categorias', 'grupos', 'asesores', 'total', 'actualizado']);
    expect(r.body.data).toMatchObject({ area_id: 1, anio: 2026, mes: 11, categorias: ['Osarios'] });
  });

  test.each([
    ['mes 0', { ...QUERY, mes: 0 }],
    ['mes 13', { ...QUERY, mes: 13 }],
    ['año 2024', { ...QUERY, anio: 2024 }],
    ['año 2100', { ...QUERY, anio: 2100 }],
    ['área decimal', { ...QUERY, area_id: '1.5' }],
    ['área texto', { ...QUERY, area_id: 'x' }],
    ['sin periodo', { area_id: 1 }]
  ])('422 con %s, sin consultar', async (_n, q) => {
    const r = await pedir(quien('ADMIN_AREA'), q);
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('VALIDATION_ERROR');
    expect(M.SvProducto.findAll).not.toHaveBeenCalled();
  });

  test('un área sin catálogo por tipos → 422 con mensaje', async () => {
    M.SvProducto.findAll.mockResolvedValue([]);
    const r = await pedir(quien('ADMIN_AREA'));
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Esta área no maneja presupuesto por categorías' });
  });

  test('sin alcance → 403', async () => {
    const r = await pedir(quien('ADMIN_AREA'), { ...QUERY, area_id: 2 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(M.SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test.each([
    ['SUPERVISOR', quien('SUPERVISOR'), true],
    ['ADMIN_AREA', quien('ADMIN_AREA'), true],
    ['SUPER_ADMIN', quien('SUPER_ADMIN'), true],
    ['COORDINADOR_PREVISION', quien('COORDINADOR_PREVISION'), false],
    ['JEFE_PAP', quien('JEFE_PAP'), false],
    ['DIRECTOR_COMERCIAL', quien('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 1 }] }), false],
    ['GERENTE_GENERAL', quien('GERENTE_GENERAL', { areasExtra: [{ area_id: 1 }] }), false],
    ['ASESOR', quien('ASESOR', { usr_id: 7 }), false],
    ['AGENTE_SVC', quien('AGENTE_SVC', { usr_id: 7 }), false]
  ])('puede_cargar de %s', async (_n, user, esperado) => {
    const r = await pedir(user);
    expect(r.status).toBe(200);
    expect(r.body.data.puede_cargar).toBe(esperado);
  });
});
