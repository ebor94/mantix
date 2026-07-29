/**
 * Task 1.1 (resuelto) — auth/rate-limit en src/routes/empresa.routes.js.
 *
 * Decisión de la controller tras el BLOCKED reportado: GET /:nit se queda
 * sin auth (lo usan los flujos públicos de Veolia y corrección, canal
 * EMPRESARIAL) pero gana el rate limiter estricto de 1.3. GET / (listado) y
 * POST / (creación) — sin consumidor público conocido — quedan detrás de
 * auth.
 *
 * Se mockea la capa de modelos (mismo patrón que tests/afiliadoScope.test.js)
 * y el servicio de empresas, para no depender de base de datos. auth.js usa
 * jsonwebtoken de verdad, así que se firman tokens con JWT_SECRET para
 * simular usuario autenticado/no autenticado.
 */

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-empresa-routes';

const mockUsuario = {
  id: 1,
  activo: true,
  es_super_admin: false,
  rol: { permisos: {} }
};

jest.mock('../src/models', () => ({
  Usuario: { findByPk: jest.fn(() => Promise.resolve(mockUsuario)) },
  Rol: {},
  UsuarioCategoria: {}
}));

jest.mock('../src/services/empresa.service', () => ({
  buscarPorNit: jest.fn(() => Promise.resolve({ nit: '900123456', nombre: 'Empresa Demo' })),
  crearEmpresa: jest.fn(() => Promise.resolve({ id: 1, nit: '900999999', nombre: 'Nueva Empresa' })),
  listarEmpresas: jest.fn(() => Promise.resolve([]))
}));

const empresaService = require('../src/services/empresa.service');
const empresaRoutes = require('../src/routes/empresa.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/empresas', empresaRoutes);
  // Handler de errores mínimo, como el real de src/app.js
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

const tokenValido = jwt.sign({ id: mockUsuario.id }, process.env.JWT_SECRET);

describe('empresa.routes.js — auth y rate limit (Task 1.1)', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test('GET /:nit sigue siendo público — responde 200 sin Authorization', async () => {
    const res = await request(app).get('/api/empresas/900123456');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { nit: '900123456', nombre: 'Empresa Demo' } });
    expect(empresaService.buscarPorNit).toHaveBeenCalledWith('900123456');
  });

  test('GET / (listado) exige auth — 401 sin Authorization', async () => {
    const res = await request(app).get('/api/empresas');
    expect(res.status).toBe(401);
    expect(empresaService.listarEmpresas).not.toHaveBeenCalled();
  });

  test('GET / (listado) responde 200 con token válido', async () => {
    const res = await request(app)
      .get('/api/empresas')
      .set('Authorization', `Bearer ${tokenValido}`);
    expect(res.status).toBe(200);
    expect(empresaService.listarEmpresas).toHaveBeenCalled();
  });

  test('POST / (creación) exige auth — 401 sin Authorization, no llega a crear', async () => {
    const res = await request(app)
      .post('/api/empresas')
      .send({ nit: '900999999', nombre: 'Nueva Empresa' });
    expect(res.status).toBe(401);
    expect(empresaService.crearEmpresa).not.toHaveBeenCalled();
  });

  test('POST / (creación) responde 201 con token válido y body válido', async () => {
    const res = await request(app)
      .post('/api/empresas')
      .set('Authorization', `Bearer ${tokenValido}`)
      .send({ nit: '900999999', nombre: 'Nueva Empresa' });
    expect(res.status).toBe(201);
    expect(empresaService.crearEmpresa).toHaveBeenCalledWith({ nit: '900999999', nombre: 'Nueva Empresa' });
  });

  test('GET /:nit tiene el rate limiter estricto montado (no el global) — bloquea con 429 al exceder el máximo', async () => {
    // Reconstruye la app con un máximo bajo propio de este test, sin afectar
    // el resto de la suite (módulo re-requerido tras resetModules).
    jest.resetModules();
    process.env.STRICT_RATE_LIMIT_MAX_REQUESTS = '3';
    jest.doMock('../src/models', () => ({
      Usuario: { findByPk: jest.fn(() => Promise.resolve(mockUsuario)) },
      Rol: {},
      UsuarioCategoria: {}
    }));
    jest.doMock('../src/services/empresa.service', () => ({
      buscarPorNit: jest.fn(() => Promise.resolve({ nit: '900123456', nombre: 'Empresa Demo' })),
      crearEmpresa: jest.fn(),
      listarEmpresas: jest.fn()
    }));
    const freshExpress = require('express');
    const freshRoutes = require('../src/routes/empresa.routes');
    const limitedApp = freshExpress();
    limitedApp.use('/api/empresas', freshRoutes);

    let last;
    for (let i = 0; i < 4; i++) {
      last = await request(limitedApp).get('/api/empresas/900123456');
    }
    expect(last.status).toBe(429);
    expect(last.body).toEqual({
      success: false,
      message: 'Demasiados intentos desde esta IP. Intenta de nuevo más tarde.'
    });

    delete process.env.STRICT_RATE_LIMIT_MAX_REQUESTS;
  });
});
