const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearRouterPorteria } = require('../routes');

afterEach(cerrarServidores);

function appCon(bd) {
  const app = express();
  app.use('/api/porteria/v1', crearRouterPorteria({ bd }));
  return app;
}

test('health ok cuando la BD responde', async () => {
  const r = await request(await servir(appCon({ ping: async () => {} }))).get('/api/porteria/v1/health');
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-SIS-001');
  expect(r.body).toEqual({ success: true, data: { estado: 'ok', bd: 'ok' } });
});

test('health 503 cuando la BD no responde, sin filtrar el error', async () => {
  const bd = { ping: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:3306'); } };
  const r = await request(await servir(appCon(bd))).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'POR-SIS-001', motivo: 'NO_DISPONIBLE', message: 'La base de datos no responde',
  });
});

test('ruta inexistente → 404 propio del módulo', async () => {
  const r = await request(await servir(appCon({ ping: async () => {} }))).get('/api/porteria/v1/no-existe');
  expect(r.status).toBe(404);
  expect(r.body).toEqual({ success: false, error: 'POR-SIS-002', motivo: 'NO_ENCONTRADO', message: 'Ruta no encontrada' });
});
