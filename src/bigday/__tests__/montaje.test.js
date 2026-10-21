// Carga la app real de Mantix: verifica el montaje en /api/bigday/v1, la exención del limitador global,
// los errores del parser propio y el 503 cuando faltan variables BIGDAY_*.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['BIGDAY_DB_HOST', 'BIGDAY_DB_PORT', 'BIGDAY_DB_USER', 'BIGDAY_DB_PASSWORD', 'BIGDAY_DB_NAME', 'BIGDAY_HASH_SALT', 'BIGDAY_RESULTS_TOKEN',
  // Variables de Mantix que el módulo usa como respaldo: se limpian para que el 503 no dependa del entorno.
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const request = require('supertest');
const app = require('../../app');

const valida = () => ({
  uuid: '7d9f4c2e-3b1a-4c5d-8e6f-0a1b2c3d4e5f', p1: 'B', p2: 'ambas', p3: 'parque_vida', p4: 'diversidad',
  p5: 'C', p6: 9, p7: 'Me encantó.', duracion_seg: 45,
});

beforeEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});
afterEach(() => jest.restoreAllMocks());

test('sin variables BIGDAY_* el módulo responde 503 claro y Mantix sigue vivo', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const h = await request(app).get('/api/bigday/v1/health');
  expect(h.status).toBe(503);
  expect(h.body.error).toMatch(/no está disponible/i);
  expect(JSON.stringify(h.body)).not.toMatch(/BIGDAY_|HOST|SALT/);
  const p = await request(app).post('/api/bigday/v1/respuestas').send(valida());
  expect(p.status).toBe(503);
  const otra = await request(app).get('/api/ruta-mantix-inexistente-503');
  expect(otra.status).toBe(404);
});

test('con variables completas la ruta está montada en /api/bigday/v1 (health 503 si la BD no responde)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Object.assign(process.env, {
    BIGDAY_DB_HOST: '127.0.0.1', BIGDAY_DB_PORT: '1', BIGDAY_DB_USER: 'u', BIGDAY_DB_PASSWORD: 'p', BIGDAY_HASH_SALT: 's',
  });
  const h = await request(app).get('/api/bigday/v1/health');
  expect(h.status).toBe(503);
  expect(h.body).toEqual({ estado: 'error', bd: 'error' });
});

test('/api/bigday/ está exento del limitador global; el resto de /api no', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(app).get('/api/bigday/v1/health');
    expect(r.status).toBe(503);
    expect(r.body.error).toBeDefined();
  }
  const estados = [];
  for (let i = 0; i < 4; i++) estados.push((await request(app).get('/api/ruta-mantix-inexistente')).status);
  expect(estados).toContain(429);
});

test('cuerpo de más de 10 KB en /api/bigday/* → 413 JSON en español', async () => {
  const r = await request(app).post('/api/bigday/v1/respuestas').send({ ...valida(), p7: 'x'.repeat(11 * 1024) });
  expect(r.status).toBe(413);
  expect(r.body).toEqual({ error: 'La solicitud es demasiado grande.' });
});

test('cuerpo urlencoded de más de 10 KB en /api/bigday/* → 413 (no llega al parser global de 10 MB)', async () => {
  const r = await request(app).post('/api/bigday/v1/respuestas').type('form').send('p7=' + 'x'.repeat(11 * 1024));
  expect(r.status).toBe(413);
  expect(r.body).toEqual({ error: 'La solicitud es demasiado grande.' });
});

test('JSON mal formado en /api/bigday/* → 400 JSON en español', async () => {
  const r = await request(app).post('/api/bigday/v1/respuestas').set('Content-Type', 'application/json').send('{"uuid": ');
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: 'JSON inválido.' });
});

test('sin BIGDAY_RESULTS_TOKEN solo los resultados dan 503; health y POST siguen atendiendo (no 503 de módulo)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Object.assign(process.env, {
    BIGDAY_DB_HOST: '127.0.0.1', BIGDAY_DB_PORT: '1', BIGDAY_DB_USER: 'u', BIGDAY_DB_PASSWORD: 'p', BIGDAY_HASH_SALT: 's',
  });
  const r = await request(app).get('/api/bigday/v1/resultados').set('Authorization', 'Bearer ');
  expect(r.status).toBe(503);
  expect(JSON.stringify(r.body)).not.toMatch(/BIGDAY_|TOKEN/);
  const rc = await request(app).get('/api/bigday/v1/resultados.csv');
  expect(rc.status).toBe(503);
  // el POST llega a la validación (400 por honeypot/duración), no al 503 de configuración
  const p = await request(app).post('/api/bigday/v1/respuestas').send({});
  expect(p.status).toBe(400);
});

test('con BIGDAY_RESULTS_TOKEN configurado, un token incorrecto da 401 y no 503', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Object.assign(process.env, {
    BIGDAY_DB_HOST: '127.0.0.1', BIGDAY_DB_PORT: '1', BIGDAY_DB_USER: 'u', BIGDAY_DB_PASSWORD: 'p', BIGDAY_HASH_SALT: 's',
    BIGDAY_RESULTS_TOKEN: 'token-largo-de-prueba',
  });
  const r = await request(app).get('/api/bigday/v1/resultados').set('Authorization', 'Bearer incorrecto');
  expect(r.status).toBe(401);
});
