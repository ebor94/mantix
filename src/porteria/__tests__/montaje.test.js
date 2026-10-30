// Carga la app real de Mantix: montaje en /api/porteria/v1, 503 si falta configuración y exención
// del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['PORTERIA_JWT_SECRET', 'PORTERIA_JWT_EXPIRES', 'LDAP_GROUP_PORTERIA_GUARDA', 'LDAP_GROUP_PORTERIA_ADMIN',
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET'];
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const app = require('../../app');

afterEach(cerrarServidores);
afterEach(() => jest.restoreAllMocks());
beforeEach(() => { for (const v of VARIABLES) delete process.env[v]; });

const completas = () => Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'u', DB_PASSWORD: 'p',
  PORTERIA_JWT_SECRET: 'p'.repeat(40), LDAP_GROUP_PORTERIA_GUARDA: 'G', LDAP_GROUP_PORTERIA_ADMIN: 'A',
});

test('sin configuración responde 503 PORTERIA_DESHABILITADO y Mantix sigue vivo', async () => {
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'POR-SIS-000', motivo: 'PORTERIA_DESHABILITADO',
    message: 'El módulo de Portería no está disponible: configuración del servidor incompleta',
  });
  expect(JSON.stringify(r.body)).not.toMatch(/PORTERIA_JWT|LDAP|DB_/);
  const otra = await request(await servir(app)).get('/api/ruta-mantix-inexistente-por');
  expect(otra.status).toBe(404);
});

test('secreto igual al de Mantix también deshabilita el módulo', async () => {
  completas();
  process.env.JWT_SECRET = process.env.PORTERIA_JWT_SECRET;
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.body.motivo).toBe('PORTERIA_DESHABILITADO');
});

test('con configuración completa la ruta está montada (health 503 porque la BD no responde)', async () => {
  completas();
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body.error).toBe('POR-SIS-001');
});

test('/api/porteria/ está exento del limitador global', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(await servir(app)).get('/api/porteria/v1/health');
    expect(r.status).toBe(503);
  }
});

test('JSON inválido en /api/porteria responde con el contrato del módulo', async () => {
  const r = await request(await servir(app))
    .post('/api/porteria/v1/health').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, motivo: 'VALIDACION', message: 'JSON inválido' });
});

test('las rutas de la Fase 1 están montadas en la app real', async () => {
  completas();
  const login = await request(await servir(app)).post('/api/porteria/v1/auth/login').send({});
  expect(login.status).toBe(400);
  expect(login.body.error).toBe('POR-AUT-001');
  const sedes = await request(await servir(app)).get('/api/porteria/v1/catalogos/sedes');
  expect(sedes.status).toBe(401);
  expect(sedes.body.error).toBe('POR-CAT-001');
});
