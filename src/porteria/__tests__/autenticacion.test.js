const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion, requiereRol, requiereSede } = require('../middleware/autenticacion');
const { firmarToken, ROLES } = require('../services/auth.service');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');

afterEach(cerrarServidores);

const CONFIG = { jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef', jwtExpires: '12h' };
const token = (extra = {}) => firmarToken({ usuario: 'jperez', nombre: 'Juan', rol: ROLES.GUARDA, sede: null, ...extra }, CONFIG);

function app() {
  const a = express();
  const autenticar = crearAutenticacion(() => CONFIG);
  const eco = (req, res) => res.json({ success: true, data: req.porUsuario });
  a.get('/abierta', apiCodigo('POR-TST-001'), autenticar, eco);
  a.get('/admin', apiCodigo('POR-TST-002'), autenticar, requiereRol(ROLES.ADMIN), eco);
  a.get('/con-sede', apiCodigo('POR-TST-003'), autenticar, requiereSede, eco);
  a.get('/async', apiCodigo('POR-TST-004'), aw(async () => { throw new PorteriaError(409, 'CONFLICTO', 'Choque'); }));
  a.use(porteriaErrorHandler);
  return a;
}

test('sin token → 401 NO_AUTENTICADO', async () => {
  const r = await request(await servir(app())).get('/abierta');
  expect(r.status).toBe(401);
  expect(r.body).toEqual({ success: false, error: 'POR-TST-001', motivo: 'NO_AUTENTICADO', message: 'Sesión inválida o vencida' });
});

test('token de otro secreto → 401', async () => {
  const ajeno = firmarToken({ usuario: 'x', nombre: 'X', rol: ROLES.GUARDA, sede: null }, { ...CONFIG, jwtSecret: 'otro' });
  const r = await request(await servir(app())).get('/abierta').set('Authorization', `Bearer ${ajeno}`);
  expect(r.status).toBe(401);
});

test('token válido deja el usuario en req.porUsuario', async () => {
  const r = await request(await servir(app())).get('/abierta').set('Authorization', `Bearer ${token()}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({ usuario: 'jperez', nombre: 'Juan', rol: 'guarda', sede_id: null, sede_nombre: null });
});

test('requiereRol: un guarda no entra a una ruta de admin', async () => {
  const r = await request(await servir(app())).get('/admin').set('Authorization', `Bearer ${token()}`);
  expect(r.status).toBe(403);
  expect(r.body).toMatchObject({ motivo: 'SIN_PERMISO', message: 'No tienes permiso para esta acción' });
  const ok = await request(await servir(app())).get('/admin').set('Authorization', `Bearer ${token({ rol: ROLES.ADMIN })}`);
  expect(ok.status).toBe(200);
});

test('requiereSede exige haber elegido sede', async () => {
  const sin = await request(await servir(app())).get('/con-sede').set('Authorization', `Bearer ${token()}`);
  expect(sin.status).toBe(403);
  expect(sin.body).toMatchObject({ motivo: 'SEDE_REQUERIDA', message: 'Elige la sede de tu turno para continuar' });
  const con = await request(await servir(app()))
    .get('/con-sede').set('Authorization', `Bearer ${token({ sede: { id: 4, nombre: 'Sur' } })}`);
  expect(con.status).toBe(200);
  expect(con.body.data.sede_id).toBe(4);
});

test('aw lleva los errores async al manejador del módulo', async () => {
  const r = await request(await servir(app())).get('/async');
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ success: false, error: 'POR-TST-004', motivo: 'CONFLICTO', message: 'Choque' });
});
