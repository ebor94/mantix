const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const PorteriaError = require('../utils/PorteriaError');

afterEach(cerrarServidores);

function appCon(manejador) {
  const app = express();
  app.use(express.json());
  app.post('/x', apiCodigo('POR-TST-001'), manejador);
  app.use('/', porteriaErrorHandler);
  return app;
}

test('PorteriaError produce el contrato con código, motivo y errores', async () => {
  const app = appCon((req, res, next) => next(
    new PorteriaError(409, 'SENTIDO_INCOHERENTE', 'El vehículo ya figura dentro', { estado: { dentro: true } }),
  ));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(409);
  expect(r.headers['x-por-api']).toBe('POR-TST-001');
  expect(r.body).toEqual({
    success: false, error: 'POR-TST-001', motivo: 'SENTIDO_INCOHERENTE',
    message: 'El vehículo ya figura dentro', errors: { estado: { dentro: true } },
  });
});

test('un error inesperado responde 500 genérico sin filtrar detalles', async () => {
  const app = appCon(() => { throw new Error("Duplicate entry 'ABC123'"); });
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(500);
  expect(r.body).toEqual({
    success: false, error: 'POR-TST-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor',
  });
});

test('una respuesta de error directa recibe código y motivo según el status', async () => {
  const app = appCon((req, res) => res.status(403).json({ success: false, message: 'Sin permiso' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body).toEqual({ success: false, error: 'POR-TST-001', motivo: 'SIN_PERMISO', message: 'Sin permiso' });
});

test('503 directo lleva motivo NO_DISPONIBLE', async () => {
  const app = appCon((req, res) => res.status(503).json({ success: false, message: 'Caído' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body.motivo).toBe('NO_DISPONIBLE');
});

test('JSON inválido → 400 VALIDACION', async () => {
  const app = appCon((req, res) => res.json({ success: true }));
  const r = await request(await servir(app)).post('/x').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ success: false, error: 'POR-SIN-CODIGO', motivo: 'VALIDACION', message: 'JSON inválido' });
});
