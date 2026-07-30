/**
 * Task 4.1/4.4/4.3 — rutas de nómina/invitaciones en src/routes/convenio.routes.js
 * y el chequeo de propiedad de convenio en src/controllers/convenio.controller.js.
 *
 * Verifica:
 *   - GET /publico/:slug sigue respondiendo 200 (smoke test del enunciado:
 *     el scope nuevo no rompió la ruta pública de Parte 1).
 *   - Las rutas internas nuevas exigen auth (401) y el permiso RBAC correcto
 *     (403 sin requirePermiso('empresa', ...)).
 *   - El scope por convenio: un usuario con empresa_id que no coincide con
 *     convenio.empresaId recibe 404 (no 403); uno que sí coincide, o que no
 *     tiene empresa_id, o que es super_admin, pasa.
 *   - GET /invitacion/:token es público (sin auth) y tiene el rate limiter
 *     estricto de Task 1 montado (no el limitePublico).
 *
 * Se mockea la capa de modelos (Usuario para auth.js real con JWT firmado, y
 * ConvenioEmpleado/ConvenioInvitacion que el controller requiere ad-hoc) y
 * los servicios convenio.service/invitacion.service — mismo patrón que
 * tests/empresaRoutes.test.js. auth.js usa jsonwebtoken real.
 */

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-convenio-nomina';

// Usuario "actual" configurable por test — Usuario.findByPk lo devuelve.
let mockUsuarioActual = null;

const mockConvenioEmpleado = { findAll: jest.fn().mockResolvedValue([]) };
const mockConvenioInvitacion = { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() };

jest.mock('../src/models', () => ({
  Usuario: { findByPk: jest.fn(() => Promise.resolve(mockUsuarioActual)) },
  Rol: {},
  UsuarioCategoria: {},
  ConvenioEmpleado: mockConvenioEmpleado,
  ConvenioInvitacion: mockConvenioInvitacion
}));

jest.mock('../src/services/convenio.service', () => ({
  ENGINE_VERSION: 'v1',
  obtenerPorSlug: jest.fn(),
  listar: jest.fn().mockResolvedValue([])
}));

jest.mock('../src/services/invitacion.service', () => ({
  resolverToken: jest.fn(),
  importarEmpleados: jest.fn(),
  generarInvitaciones: jest.fn(),
  enviarInvitacion: jest.fn()
}));

const convenioService = require('../src/services/convenio.service');
const invitacionService = require('../src/services/invitacion.service');
const convenioRoutes = require('../src/routes/convenio.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/convenios', convenioRoutes);
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  return app;
}

function tokenPara(usuario) {
  return jwt.sign({ id: usuario.id }, process.env.JWT_SECRET);
}

const convenioFalso = { id: 10, slug: 'conyca', nombre: 'CONYCA', empresaId: 5, activo: 1 };

describe('convenio.routes.js — GET /publico/:slug (smoke test, no debe romperse)', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test('sigue respondiendo 200 sin autenticación', async () => {
    convenioService.obtenerPorSlug.mockResolvedValue({
      ...convenioFalso,
      toPublicJSON: () => ({ slug: 'conyca', nombre: 'CONYCA' })
    });

    const res = await request(app).get('/api/convenios/publico/conyca');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('convenio.routes.js — GET /:slug/empleados (auth + requirePermiso + scope por empresa)', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    convenioService.obtenerPorSlug.mockResolvedValue({ ...convenioFalso });
  });

  test('401 sin Authorization', async () => {
    const res = await request(app).get('/api/convenios/conyca/empleados');
    expect(res.status).toBe(401);
    expect(mockConvenioEmpleado.findAll).not.toHaveBeenCalled();
  });

  test('403 con token válido pero sin permiso empresa.ver', async () => {
    mockUsuarioActual = { id: 1, activo: true, es_super_admin: false, rol: { permisos: {} } };
    const res = await request(app)
      .get('/api/convenios/conyca/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(403);
    expect(mockConvenioEmpleado.findAll).not.toHaveBeenCalled();
  });

  test('200 con permiso empresa.ver y sin empresa_id (ej. admin interno): sin restricción de scope', async () => {
    mockUsuarioActual = {
      id: 2, activo: true, es_super_admin: false,
      rol: { permisos: { empresa: { ver: true } } }
    };
    const res = await request(app)
      .get('/api/convenios/conyca/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(200);
    expect(mockConvenioEmpleado.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { convenioId: 10 } })
    );
  });

  test('404 (no 403) cuando empresa_id del usuario NO coincide con convenio.empresaId', async () => {
    mockUsuarioActual = {
      id: 3, activo: true, es_super_admin: false, empresa_id: 999,
      rol: { permisos: { empresa: { ver: true } } }
    };
    const res = await request(app)
      .get('/api/convenios/conyca/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(404);
    expect(mockConvenioEmpleado.findAll).not.toHaveBeenCalled();
  });

  test('200 cuando empresa_id del usuario SÍ coincide con convenio.empresaId', async () => {
    mockUsuarioActual = {
      id: 4, activo: true, es_super_admin: false, empresa_id: 5, // == convenioFalso.empresaId
      rol: { permisos: { empresa: { ver: true } } }
    };
    const res = await request(app)
      .get('/api/convenios/conyca/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(200);
  });

  test('200 para super_admin sin importar empresa_id', async () => {
    mockUsuarioActual = { id: 5, activo: true, es_super_admin: true, empresa_id: 999 };
    const res = await request(app)
      .get('/api/convenios/conyca/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(200);
  });

  test('404 cuando el convenio no existe', async () => {
    convenioService.obtenerPorSlug.mockResolvedValue(null);
    mockUsuarioActual = { id: 6, activo: true, es_super_admin: true };
    const res = await request(app)
      .get('/api/convenios/no-existe/empleados')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`);
    expect(res.status).toBe(404);
  });
});

describe('convenio.routes.js — endpoints de gestión (POST) exigen su propio permiso', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    convenioService.obtenerPorSlug.mockResolvedValue({ ...convenioFalso });
  });

  test('POST /:slug/empleados/importar exige empresa.gestionar_empleados (403 con solo empresa.ver)', async () => {
    mockUsuarioActual = {
      id: 7, activo: true, es_super_admin: false,
      rol: { permisos: { empresa: { ver: true } } } // sin gestionar_empleados
    };
    const res = await request(app)
      .post('/api/convenios/conyca/empleados/importar')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`)
      .send({ filas: [] });
    expect(res.status).toBe(403);
    expect(invitacionService.importarEmpleados).not.toHaveBeenCalled();
  });

  test('POST /:slug/empleados/importar con el permiso correcto delega en invitacionService.importarEmpleados', async () => {
    mockUsuarioActual = {
      id: 8, activo: true, es_super_admin: false,
      rol: { permisos: { empresa: { gestionar_empleados: true } } }
    };
    invitacionService.importarEmpleados.mockResolvedValue({ creados: 1, actualizados: 0, ignorados: 0, errores: [] });

    const res = await request(app)
      .post('/api/convenios/conyca/empleados/importar')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`)
      .send({ filas: [{ numeroDocumento: '1' }] });

    expect(res.status).toBe(200);
    expect(invitacionService.importarEmpleados).toHaveBeenCalledWith(10, [{ numeroDocumento: '1' }], mockUsuarioActual);
  });

  test('POST /:slug/invitaciones exige empresa.invitar (401/403 sin auth ni permiso)', async () => {
    const resSinAuth = await request(app).post('/api/convenios/conyca/invitaciones').send({ empleadoIds: [1] });
    expect(resSinAuth.status).toBe(401);

    mockUsuarioActual = { id: 9, activo: true, es_super_admin: false, rol: { permisos: {} } };
    const resSinPermiso = await request(app)
      .post('/api/convenios/conyca/invitaciones')
      .set('Authorization', `Bearer ${tokenPara(mockUsuarioActual)}`)
      .send({ empleadoIds: [1] });
    expect(resSinPermiso.status).toBe(403);
    expect(invitacionService.generarInvitaciones).not.toHaveBeenCalled();
  });
});

describe('convenio.routes.js — GET /invitacion/:token (público, rate limiter estricto)', () => {
  test('responde sin Authorization (pública)', async () => {
    jest.resetModules();
    jest.doMock('../src/models', () => ({
      Usuario: { findByPk: jest.fn() }, Rol: {}, UsuarioCategoria: {},
      ConvenioEmpleado: { findAll: jest.fn() }, ConvenioInvitacion: { findAll: jest.fn(), findOne: jest.fn() }
    }));
    jest.doMock('../src/services/convenio.service', () => ({ obtenerPorSlug: jest.fn(), listar: jest.fn() }));
    jest.doMock('../src/services/invitacion.service', () => ({
      resolverToken: jest.fn().mockResolvedValue({ convenio: { slug: 'conyca' }, empleado: { primerNombre: 'Ana' } })
    }));
    const freshExpress = require('express');
    const freshRoutes = require('../src/routes/convenio.routes');
    const app = freshExpress();
    app.use('/api/convenios', freshRoutes);

    const res = await request(app).get('/api/convenios/invitacion/tok-123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { convenio: { slug: 'conyca' }, empleado: { primerNombre: 'Ana' } }
    });
  });

  test('tiene el rate limiter ESTRICTO montado (no el limitePublico de 120/5min) — bloquea con 429 al exceder el máximo bajo', async () => {
    jest.resetModules();
    process.env.STRICT_RATE_LIMIT_MAX_REQUESTS = '3';
    jest.doMock('../src/models', () => ({
      Usuario: { findByPk: jest.fn() }, Rol: {}, UsuarioCategoria: {},
      ConvenioEmpleado: { findAll: jest.fn() }, ConvenioInvitacion: { findAll: jest.fn(), findOne: jest.fn() }
    }));
    jest.doMock('../src/services/convenio.service', () => ({ obtenerPorSlug: jest.fn(), listar: jest.fn() }));
    jest.doMock('../src/services/invitacion.service', () => ({
      resolverToken: jest.fn().mockRejectedValue(Object.assign(new Error('Invitación no válida'), { statusCode: 404 }))
    }));
    const freshExpress = require('express');
    const freshRoutes = require('../src/routes/convenio.routes');
    const app = freshExpress();
    app.use('/api/convenios', freshRoutes);
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));

    let last;
    for (let i = 0; i < 4; i++) {
      last = await request(app).get('/api/convenios/invitacion/tok-x');
    }
    expect(last.status).toBe(429);
    expect(last.body).toEqual({
      success: false,
      message: 'Demasiados intentos desde esta IP. Intenta de nuevo más tarde.'
    });

    delete process.env.STRICT_RATE_LIMIT_MAX_REQUESTS;
  });
});
