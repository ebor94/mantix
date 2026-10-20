// I1: TRK_JWT_SECRET obligatorio y distinto de los secretos de Mantix; si no, el módulo queda deshabilitado (503).
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const ENV_ORIGINAL = { ...process.env };
afterEach(() => {
  for (const k of ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET']) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_ORIGINAL[k];
  }
});

const { verificarEntorno } = require('../verificarEntorno');

describe('verificarEntorno', () => {
  test('falta TRK_JWT_SECRET → no ok', () => {
    expect(verificarEntorno({ JWT_SECRET: 'a' }).ok).toBe(false);
  });
  test('igual a JWT_SECRET → no ok', () => {
    expect(verificarEntorno({ JWT_SECRET: 'mismo', TRK_JWT_SECRET: 'mismo' }).ok).toBe(false);
  });
  test('igual a IDENTIDAD_JWT_SECRET → no ok', () => {
    expect(verificarEntorno({ JWT_SECRET: 'a', IDENTIDAD_JWT_SECRET: 'sso', TRK_JWT_SECRET: 'sso' }).ok).toBe(false);
  });
  test('distinto → ok', () => {
    expect(verificarEntorno({ JWT_SECRET: 'a', IDENTIDAD_JWT_SECRET: 'b', TRK_JWT_SECRET: 'c' }).ok).toBe(true);
  });
});

describe('router TRK con entorno inválido', () => {
  const app = () => {
    const a = express();
    a.use('/api/trk/v1', require('../../routes').router);
    return a;
  };

  test('TRK_JWT_SECRET igual a JWT_SECRET → 503 con contrato TRK', async () => {
    process.env.JWT_SECRET = 'mismo-secreto';
    process.env.TRK_JWT_SECRET = 'mismo-secreto';
    const r = await request(app()).get('/api/trk/v1/auth/usuarios-pin');
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ success: false, error: expect.stringMatching(/^TRK-/), motivo: 'TRK_DESHABILITADO', message: expect.any(String) });
  });

  test('sin TRK_JWT_SECRET → 503', async () => {
    process.env.JWT_SECRET = 'x';
    delete process.env.TRK_JWT_SECRET;
    const r = await request(app()).get('/api/trk/v1/no-existe');
    expect(r.status).toBe(503);
  });
});

describe('Mantix resolverUsuarioDesdeToken', () => {
  test('rechaza tokens con scope trk aunque estén firmados con JWT_SECRET', async () => {
    process.env.JWT_SECRET = 'mismo-secreto';
    const db = require('../../../models');
    const spy = jest.spyOn(db.Usuario, 'findByPk').mockResolvedValue({ id: 7, activo: true });
    const { resolverUsuarioDesdeToken } = require('../../../middleware/auth');
    const tokenPin = jwt.sign({ id: 7, scope: 'trk', tv: 0 }, 'mismo-secreto');
    await expect(resolverUsuarioDesdeToken(tokenPin)).resolves.toBeNull();
    const tokenMantix = jwt.sign({ id: 7 }, 'mismo-secreto');
    await expect(resolverUsuarioDesdeToken(tokenMantix)).resolves.toEqual({ id: 7, activo: true });
    spy.mockRestore();
  });
});
