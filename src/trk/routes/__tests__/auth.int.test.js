const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { auth: authMantix } = require('../../../middleware/auth');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(limpiar);
afterAll(cerrar);

describe('TRK-AUTH-001 POST /auth/pin', () => {
  test('PIN correcto → token y perfil con permisos del rol', async () => {
    const { usuario } = await crearOperativo('TRK_JURADO', { nombre: 'Jurado Uno', pin: '246810' });
    const r = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: usuario.id, pin: '246810' });
    expect(r.status).toBe(200);
    expect(r.headers['x-trk-api']).toBe('TRK-AUTH-001');
    expect(r.body.data.token).toEqual(expect.any(String));
    expect(r.body.data.usuario).toEqual({ id: usuario.id, nombre: 'Jurado Uno', rol: 'TRK_JURADO', permisos: { calificar: true } });
  });

  test('PIN incorrecto → 401 con contrato TRK', async () => {
    const { usuario } = await crearOperativo('TRK_JURADO', { pin: '111111' });
    const r = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: usuario.id, pin: '222222' });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ success: false, error: 'TRK-AUTH-001', motivo: 'NO_AUTENTICADO' });
  });

  test('usuario inactivo no entra', async () => {
    const { usuario } = await crearOperativo('TRK_CABINA', { pin: '333333', activo: false });
    const r = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: usuario.id, pin: '333333' });
    expect(r.status).toBe(401);
  });

  test('un admin de Mantix no puede entrar por PIN', async () => {
    const { usuario } = await crearAdmin();
    const r = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: usuario.id, pin: '123456' });
    expect(r.status).toBe(401);
  });

  test('PIN con formato inválido → 400 VALIDACION', async () => {
    const r = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: 1, pin: '12ab' });
    expect(r.status).toBe(400);
    expect(r.body.motivo).toBe('VALIDACION');
  });

  test('más de 5 intentos por minuto para el mismo usuario → 429', async () => {
    const { usuario } = await crearOperativo('TRK_JURADO', { pin: '555555' });
    const estados = [];
    for (let i = 0; i < 6; i++) {
      estados.push((await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: usuario.id, pin: '000000' })).status);
    }
    expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(estados[5]).toBe(429);
  });
});

describe('TRK-AUTH-001 limitadores (I2)', () => {
  // Un único servidor (no uno por request) para las ráfagas de ~100 requests.
  const pinDesde = (ip, cuerpo) => request(servidor).post('/api/trk/v1/auth/pin').set('X-Forwarded-For', ip).send(cuerpo);

  test('variantes del mismo id ("01", " 1", "1.0", "1e0"…) comparten el límite IP+usuario', async () => {
    const { usuario } = await crearOperativo('TRK_JURADO', { pin: '555555' });
    const id = usuario.id;
    const variantes = [`0${id}`, `00${id}`, `${id}.0`, `+${id}`, ` ${id}`, `${id}e0`];
    const estados = [];
    for (const v of variantes) estados.push((await pinDesde('10.0.0.1', { usuario_id: v, pin: '000000' })).status);
    expect(estados.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(estados[5]).toBe(429);
  });

  test('límite por usuario (solo fallos) aunque el atacante rote IPs: 10 fallos en 15 min → 429 incluso con el PIN correcto', async () => {
    const { usuario } = await crearOperativo('TRK_CABINA', { pin: '424242' });
    for (let i = 1; i <= 10; i++) {
      const r = await pinDesde(`10.1.0.${i}`, { usuario_id: usuario.id, pin: '000000' });
      expect(r.status).toBe(401);
    }
    const r = await pinDesde('10.1.0.99', { usuario_id: usuario.id, pin: '424242' });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ success: false, error: 'TRK-AUTH-001', motivo: 'DEMASIADOS_INTENTOS' });
  });

  test('los ingresos correctos no cuentan para el límite por usuario', async () => {
    const { usuario } = await crearOperativo('TRK_JURADO', { pin: '135791' });
    for (let i = 1; i <= 12; i++) {
      const r = await pinDesde(`10.3.0.${i}`, { usuario_id: usuario.id, pin: '135791' });
      expect(r.status).toBe(200);
    }
  });

  test('tope grueso por IP: 100 intentos en 15 min → 429 aunque cambie el usuario', async () => {
    const estados = [];
    for (let i = 0; i < 101; i++) estados.push((await pinDesde('10.2.0.1', { usuario_id: 900000 + i, pin: '000000' })).status);
    expect(estados.slice(0, 100).every((s) => s === 401)).toBe(true);
    expect(estados[100]).toBe(429);
  });
});

describe('TRK-AUTH-002 GET /auth/usuarios-pin', () => {
  test('lista solo operativos activos, sin correo', async () => {
    await crearAdmin();
    const { usuario: jurado } = await crearOperativo('TRK_JURADO', { nombre: 'Jurado Dos' });
    await crearOperativo('TRK_CABINA', { nombre: 'Cabina', activo: false });
    const r = await request(servidor).get('/api/trk/v1/auth/usuarios-pin');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ id: jurado.id, nombre: 'Jurado Dos', rol: 'TRK_JURADO' }]);
  });
});

describe('TRK-AUTH-003 GET /auth/yo', () => {
  test('con token de PIN', async () => {
    const { usuario, token } = await crearOperativo('TRK_COMENTARISTA', { nombre: 'Locutor' });
    const r = await request(servidor).get('/api/trk/v1/auth/yo').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: usuario.id, nombre: 'Locutor', rol: 'TRK_COMENTARISTA', permisos: { pasarela: true } });
  });

  test('con token de Mantix de un administrador', async () => {
    const { token } = await crearAdmin();
    const r = await request(servidor).get('/api/trk/v1/auth/yo').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.data.permisos).toMatchObject({ administrar: true, publicar: true });
    expect(r.body.data.permisos.calificar).toBeUndefined();
  });

  test('sin token → 401 con código', async () => {
    const r = await request(servidor).get('/api/trk/v1/auth/yo');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'TRK-AUTH-003', motivo: 'NO_AUTENTICADO' });
  });

  test('cambiar token_version invalida el token de PIN (HU-2 CA3)', async () => {
    const { usuario, token } = await crearOperativo('TRK_JURADO');
    await db.TrkAcceso.increment('token_version', { where: { usuario_id: usuario.id } });
    const r = await request(servidor).get('/api/trk/v1/auth/yo').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(401);
  });
});

test('§13.12: un token de PIN no sirve en rutas de Mantix', async () => {
  const { token } = await crearOperativo('TRK_JURADO');
  const appMantix = express();
  appMantix.get('/mantix', authMantix, (req, res) => res.json({ ok: true }));
  const r = await request(appMantix).get('/mantix').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(401);
});
