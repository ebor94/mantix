const express = require('express');
const request = require('supertest');
const Joi = require('joi');
const apiCodigo = require('../apiCodigo');
const { trkErrorHandler } = require('../errorHandler');
const validar = require('../validar');
const TrkError = require('../../utils/TrkError');
const aw = require('../../utils/aw');
const { ok } = require('../../utils/respuesta');

function app() {
  const a = express();
  a.use(express.json());
  a.get('/ok', apiCodigo('TRK-EVT-901'), (req, res) => ok(res, { hola: 1 }));
  a.get('/trk-error', apiCodigo('TRK-CAL-902'), aw(async () => { throw new TrkError(409, 'CALIFICACION_BLOQUEADA', 'Bloqueada'); }));
  a.get('/boom', apiCodigo('TRK-CAL-903'), aw(async () => { throw new Error('secreto interno'); }));
  a.get('/legacy-403', apiCodigo('TRK-USR-904'), (req, res) => res.status(403).json({ success: false, message: 'No tienes permiso' }));
  a.post('/validar', apiCodigo('TRK-PAR-905'), validar(Joi.object({ n: Joi.number().integer().min(1).required() })), (req, res) => ok(res, req.body));
  a.use(trkErrorHandler);
  return a;
}

test('respuesta exitosa lleva X-TRK-API y { success, data }', async () => {
  const r = await request(app()).get('/ok');
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-EVT-901');
  expect(r.body).toEqual({ success: true, data: { hola: 1 } });
});

test('TrkError → status, error = código, motivo y mensaje', async () => {
  const r = await request(app()).get('/trk-error');
  expect(r.status).toBe(409);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-902');
  expect(r.body).toEqual({ success: false, error: 'TRK-CAL-902', motivo: 'CALIFICACION_BLOQUEADA', message: 'Bloqueada' });
});

test('error no controlado → 500 sin filtrar detalles internos', async () => {
  const r = await request(app()).get('/boom');
  expect(r.status).toBe(500);
  expect(r.body).toEqual({ success: false, error: 'TRK-CAL-903', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
});

test('respuestas de error de middlewares de Mantix reciben código y motivo', async () => {
  const r = await request(app()).get('/legacy-403');
  expect(r.body).toEqual({ success: false, message: 'No tienes permiso', error: 'TRK-USR-904', motivo: 'SIN_PERMISO' });
});

test('validar → 400 VALIDACION con errores por campo y body convertido', async () => {
  const malo = await request(app()).post('/validar').send({ n: 0 });
  expect(malo.status).toBe(400);
  expect(malo.body.motivo).toBe('VALIDACION');
  expect(malo.body.errors).toEqual([{ campo: 'n', mensaje: expect.any(String) }]);
  const bueno = await request(app()).post('/validar').send({ n: '3', extra: 'x' });
  expect(bueno.body.data).toEqual({ n: 3 });
});
