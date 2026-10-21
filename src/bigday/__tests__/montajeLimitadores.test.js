// Regresión: express-rate-limit registra ERR_ERL_CREATED_IN_REQUEST_HANDLER si un limitador se crea dentro
// de un request. El router de producción (y sus limitadores) debe construirse al cargar el módulo.
const VARIABLES = ['BIGDAY_DB_HOST', 'BIGDAY_DB_PORT', 'BIGDAY_DB_USER', 'BIGDAY_DB_PASSWORD', 'BIGDAY_DB_NAME', 'BIGDAY_HASH_SALT', 'BIGDAY_RESULTS_TOKEN',
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

// Sin BD real: el pool es un doble que registra con qué configuración se creó.
const mockCrearPool = jest.fn();
jest.mock('../db', () => ({ crearPool: (...args) => mockCrearPool(...args) }));

const request = require('supertest');
const app = require('../../app');

const valida = () => ({
  uuid: '7d9f4c2e-3b1a-4c5d-8e6f-0a1b2c3d4e5f', p1: 'B', p2: 'ambas', p3: 'parque_vida', p4: 'diversidad',
  p5: 'C', p6: 9, p7: 'Me encantó.', duracion_seg: 45,
});

beforeEach(() => {
  for (const v of VARIABLES) delete process.env[v];
  mockCrearPool.mockReset();
  mockCrearPool.mockImplementation(() => ({
    query: jest.fn().mockResolvedValue([[{ 1: 1 }]]),
    execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
  }));
});
afterEach(() => jest.restoreAllMocks());

const mensajes = (espia) => espia.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

test('con entorno válido no se crea ningún limitador dentro de un request (sin ERR_ERL en el log)', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  Object.assign(process.env, {
    BIGDAY_DB_HOST: '127.0.0.1', BIGDAY_DB_USER: 'u', BIGDAY_DB_PASSWORD: 'p', BIGDAY_HASH_SALT: 's',
  });
  // el pool se crea de forma perezosa: nada al cargar la app
  expect(mockCrearPool).not.toHaveBeenCalled();

  const h = await request(app).get('/api/bigday/v1/health');
  expect(h.status).toBe(200);
  expect(h.body).toEqual({ estado: 'ok', bd: 'ok' });
  const p = await request(app).post('/api/bigday/v1/respuestas').send(valida());
  expect(p.status).toBe(201);
  await request(app).get('/api/bigday/v1/resultados').set('Authorization', 'Bearer x');

  expect(mensajes(error)).not.toMatch(/ERR_ERL/);
  expect(mensajes(warn)).not.toMatch(/ERR_ERL/);
  // el pool se construyó una sola vez, con la configuración leída del entorno en el primer uso
  expect(mockCrearPool).toHaveBeenCalledTimes(1);
  expect(mockCrearPool.mock.calls[0][0]).toMatchObject({ host: '127.0.0.1', user: 'u', password: 'p', database: 'serfuweb' });
});

test('sin entorno el módulo responde 503 genérico, no crea pool y Mantix sigue vivo', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const h = await request(app).get('/api/bigday/v1/health');
  expect(h.status).toBe(503);
  expect(JSON.stringify(h.body)).not.toMatch(/BIGDAY_|HOST|SALT/);
  const p = await request(app).post('/api/bigday/v1/respuestas').send(valida());
  expect(p.status).toBe(503);
  expect((await request(app).get('/api/ruta-mantix-inexistente-503')).status).toBe(404);
  expect(mockCrearPool).not.toHaveBeenCalled();
});
