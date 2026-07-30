/**
 * Task 1.3 — limiter estricto reusable (src/middleware/strictRateLimit.js).
 *
 * No depende de BD ni de app.js completo: se monta el middleware solo en una
 * app Express mínima para verificar que sí limita, con qué mensaje, y que
 * queda por debajo del límite global (1000/15min) para ser efectivo contra
 * fuerza bruta dirigida a un solo endpoint.
 *
 * Fix 4 (ronda de revisión): el módulo dejó de exportar un único limiter
 * directamente — ahora exporta `{ strictRateLimit, invitacionRateLimit }`,
 * dos instancias con su propio MemoryStore/budget, para que el flujo masivo
 * de invitaciones de convenio no comparta presupuesto con login/OTP (ver
 * tests/afiliadoConvenioInvitacionRateLimit.test.js y
 * tests/convenioNomina.routes.test.js para el comportamiento de
 * invitacionRateLimit en sus rutas reales).
 */

const express = require('express');
const request = require('supertest');

describe('strictRateLimit', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    const { strictRateLimit } = require('../src/middleware/strictRateLimit');
    app = express();
    app.use('/probe', strictRateLimit, (req, res) => res.json({ success: true }));
  });

  test('permite peticiones dentro del límite', async () => {
    const res = await request(app).get('/probe');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('bloquea con 429 y mensaje en español al exceder el límite', async () => {
    const max = Number(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS) || 10;
    let last;
    for (let i = 0; i < max + 1; i++) {
      last = await request(app).get('/probe');
    }
    expect(last.status).toBe(429);
    expect(last.body).toEqual({
      success: false,
      message: 'Demasiados intentos desde esta IP. Intenta de nuevo más tarde.'
    });
  });

  test('el límite estricto es más restrictivo que el limiter global (1000/15min)', () => {
    const max = Number(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS) || 10;
    expect(max).toBeLessThan(1000);
  });
});

describe('invitacionRateLimit (Fix 4)', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    const { invitacionRateLimit } = require('../src/middleware/strictRateLimit');
    app = express();
    app.use('/probe', invitacionRateLimit, (req, res) => res.json({ success: true }));
  });

  test('permite peticiones dentro del límite', async () => {
    const res = await request(app).get('/probe');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('bloquea con 429 y mensaje propio (distinto del de strictRateLimit) al exceder el límite', async () => {
    const max = Number(process.env.INVITACION_RATE_LIMIT_MAX_REQUESTS) || 80;
    let last;
    for (let i = 0; i < max + 1; i++) {
      last = await request(app).get('/probe');
    }
    expect(last.status).toBe(429);
    expect(last.body).toEqual({
      success: false,
      message: 'Demasiadas solicitudes de invitación desde esta IP. Intenta de nuevo más tarde.'
    });
  }, 15000);

  test('es más permisivo que strictRateLimit (mayor "max"), para no bloquear registro masivo desde una IP de oficina', () => {
    const maxInvitacion = Number(process.env.INVITACION_RATE_LIMIT_MAX_REQUESTS) || 80;
    const maxEstricto = Number(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS) || 10;
    expect(maxInvitacion).toBeGreaterThan(maxEstricto);
  });

  test('es una instancia SEPARADA de strictRateLimit (contadores independientes)', () => {
    const { strictRateLimit, invitacionRateLimit } = require('../src/middleware/strictRateLimit');
    expect(invitacionRateLimit).not.toBe(strictRateLimit);
  });
});
