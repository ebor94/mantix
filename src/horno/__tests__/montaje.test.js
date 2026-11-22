// Carga la app real de Mantix: montaje en /api/horno/v1, 503 si falta configuración y exención del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['HORNO_DB_HOST', 'HORNO_DB_PORT', 'HORNO_DB_USER', 'HORNO_DB_PASSWORD', 'HORNO_DB_NAME',
  'HORNO_JWT_SECRET', 'HORNO_JWT_EXPIRES', 'HORNO_GRUPO_AD', 'LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_USER',
  'LDAP_BIND_PASS', 'JWT_SECRET'];
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const app = require('../../app');

afterEach(cerrarServidores);
beforeEach(() => { for (const v of VARIABLES) delete process.env[v]; });

const completas = () => Object.assign(process.env, {
  HORNO_DB_HOST: '127.0.0.1', HORNO_DB_PORT: '1', HORNO_DB_USER: 'u', HORNO_DB_PASSWORD: 'p',
  HORNO_JWT_SECRET: 'h'.repeat(40),
  LDAP_URL: 'ldap://127.0.0.1:1', LDAP_BASE_DN: 'DC=x', LDAP_BIND_USER: 'u', LDAP_BIND_PASS: 'p',
});

test('sin configuración responde 503 HORNO_DESHABILITADO y Mantix sigue vivo', async () => {
  const r = await request(await servir(app)).get('/api/horno/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'HOR-SIS-000', motivo: 'HORNO_DESHABILITADO',
    message: 'El módulo del horno no está disponible: configuración del servidor incompleta',
  });
  expect(JSON.stringify(r.body)).not.toMatch(/HORNO_DB|LDAP|JWT/);
});

test('secreto igual al de Mantix también deshabilita el módulo', async () => {
  completas();
  process.env.JWT_SECRET = process.env.HORNO_JWT_SECRET;
  const r = await request(await servir(app)).get('/api/horno/v1/health');
  expect(r.body.motivo).toBe('HORNO_DESHABILITADO');
});

test('con configuración completa las rutas están montadas', async () => {
  completas();
  const health = await request(await servir(app)).get('/api/horno/v1/health');
  expect(health.status).toBe(503); // la BD de prueba (puerto 1) no responde
  expect(health.body.error).toBe('HOR-SIS-001');
  const login = await request(await servir(app)).post('/api/horno/v1/auth/login').send({});
  expect([login.status, login.body.error]).toEqual([400, 'HOR-AUT-001']);
  const ultima = await request(await servir(app)).get('/api/horno/v1/lecturas/ultima');
  expect([ultima.status, ultima.body.error]).toEqual([401, 'HOR-LEC-001']);
});

test('/api/horno/ está exento del limitador global', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(await servir(app)).get('/api/horno/v1/health');
    expect(r.status).toBe(503);
  }
});

test('JSON inválido en /api/horno responde con el contrato del módulo', async () => {
  const r = await request(await servir(app))
    .post('/api/horno/v1/auth/login').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, motivo: 'VALIDACION', message: 'JSON inválido' });
});
