const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearRouterMasajes, crearGuardian } = require('../routes');

afterEach(cerrarServidores);

const appCon = (router) => express().use('/api/masajes/v1', router);

describe('router del módulo', () => {
  test('GET /health con BD arriba → 200', async () => {
    const app = appCon(crearRouterMasajes({ bd: { ping: async () => {} } }));
    const r = await request(await servir(app)).get('/api/masajes/v1/health');
    expect(r.status).toBe(200);
    expect(r.headers['x-msj-api']).toBe('MSJ-SIS-001');
    expect(r.body).toEqual({ success: true, data: { estado: 'ok', bd: 'ok' } });
  });

  test('GET /health con BD caída → 503 sin detalles del error', async () => {
    const bd = { ping: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:3306 user=root'); } };
    const r = await request(await servir(appCon(crearRouterMasajes({ bd })))).get('/api/masajes/v1/health');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ success: false, error: 'MSJ-SIS-001', motivo: 'NO_DISPONIBLE', message: 'La base de datos no responde' });
    expect(JSON.stringify(r.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|root/);
  });

  test('ruta inexistente → 404 con el contrato', async () => {
    const r = await request(await servir(appCon(crearRouterMasajes({ bd: { ping: async () => {} } })))).get('/api/masajes/v1/nada');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'MSJ-SIS-002', motivo: 'NO_ENCONTRADO', message: 'Ruta no encontrada' });
  });
});

describe('guardián de configuración', () => {
  const real = (req, res) => res.json({ success: true, data: 'real' });
  const log = () => ({ error: jest.fn(), warn: jest.fn() });

  test('configuración inválida → 503 MSJ-SIS-000 sin el motivo interno, y lo registra una sola vez', async () => {
    const l = log();
    const guardian = crearGuardian({ leer: () => ({ ok: false, motivo: 'Falta MASAJES_JWT_SECRET' }), real, log: l });
    const s = await servir(appCon(guardian));
    const r1 = await request(s).get('/api/masajes/v1/health');
    await request(s).get('/api/masajes/v1/health');
    expect(r1.status).toBe(503);
    expect(r1.headers['x-msj-api']).toBe('MSJ-SIS-000');
    expect(r1.body).toEqual({
      success: false, error: 'MSJ-SIS-000', motivo: 'NO_DISPONIBLE',
      message: 'La agenda de masajes no está disponible: configuración del servidor incompleta',
    });
    expect(JSON.stringify(r1.body)).not.toMatch(/MASAJES_JWT_SECRET/);
    expect(l.error).toHaveBeenCalledTimes(1);
    expect(l.error.mock.calls[0][0]).toMatch(/MASAJES_JWT_SECRET/);
  });

  test('configuración válida → delega en el router real y advierte una sola vez', async () => {
    const l = log();
    const guardian = crearGuardian({ leer: () => ({ ok: true, advertencia: 'usa DB_USER', config: {} }), real, log: l });
    const s = await servir(appCon(guardian));
    const r = await request(s).get('/api/masajes/v1/x');
    await request(s).get('/api/masajes/v1/x');
    expect(r.body).toEqual({ success: true, data: 'real' });
    expect(l.warn).toHaveBeenCalledTimes(1);
  });

  test('al volver a fallar después de recuperarse, vuelve a registrar', async () => {
    const l = log();
    let ok = false;
    const guardian = crearGuardian({ leer: () => (ok ? { ok: true, config: {} } : { ok: false, motivo: 'x' }), real, log: l });
    const s = await servir(appCon(guardian));
    await request(s).get('/api/masajes/v1/x');
    ok = true;
    await request(s).get('/api/masajes/v1/x');
    ok = false;
    await request(s).get('/api/masajes/v1/x');
    expect(l.error).toHaveBeenCalledTimes(2);
  });
});
