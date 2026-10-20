// Carga la app real de Mantix: verifica montaje en /api/trk/v1 y exención del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
require('../testing/env'); // secretos JWT distintos (I1: sin ellos el router TRK responde 503)
const request = require('supertest');
const app = require('../../app');

test('rutas TRK desconocidas responden con el contrato TRK (montado en /api/trk/v1)', async () => {
  const r = await request(app).get('/api/trk/v1/no-existe');
  expect(r.status).toBe(404);
  expect(r.body).toMatchObject({ success: false, motivo: 'NO_ENCONTRADO' });
  expect(r.headers['x-trk-api']).toBe('TRK-SIN-CODIGO');
});

test('/api/trk/ está exento del limitador global; el resto de /api no', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(app).get('/api/trk/v1/no-existe');
    expect(r.status).toBe(404);
  }
  const estados = [];
  for (let i = 0; i < 4; i++) estados.push((await request(app).get('/api/ruta-mantix-inexistente')).status);
  expect(estados).toContain(429);
});

test('M5: JSON mal formado en /api/trk/* responde con el contrato TRK', async () => {
  const r = await request(app).post('/api/trk/v1/auth/pin').set('Content-Type', 'application/json').send('{"usuario_id": 1,');
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ success: false, error: expect.stringMatching(/^TRK-/), motivo: 'VALIDACION', message: expect.any(String) });
  expect(r.headers['x-trk-api']).toMatch(/^TRK-/);
});

test('M5: cuerpo de más de 10 MB en /api/trk/* → 413 con el contrato TRK', async () => {
  const grande = JSON.stringify({ x: 'a'.repeat(11 * 1024 * 1024) });
  const r = await request(app).post('/api/trk/v1/auth/pin').set('Content-Type', 'application/json').send(grande);
  expect(r.status).toBe(413);
  expect(r.body).toMatchObject({ success: false, error: expect.stringMatching(/^TRK-/), motivo: 'VALIDACION' });
});
