const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
afterEach(cerrarServidores);
const logger = require('../../../utils/logger');
const { trkErrorHandler } = require('../errorHandler');

test('un error 5xx de base de datos no lleva datos personales al log y la respuesta no cambia', async () => {
  const error = jest.fn();
  const child = jest.spyOn(logger, 'child').mockReturnValue({ info: jest.fn(), warn: jest.fn(), error });
  const app = express();
  app.get('/x', (req, res, next) => {
    const e = new Error("Duplicate entry '1004123456' for key 'x'");
    e.name = 'SequelizeUniqueConstraintError';
    e.parent = { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry '1004123456'", sql: 'INSERT ... 1004123456' };
    next(e);
  });
  app.use(trkErrorHandler);
  const res = await request(await servir(app)).get('/x');
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ success: false, error: 'TRK-SIN-CODIGO', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
  expect(error).toHaveBeenCalled();
  const logueado = JSON.stringify(error.mock.calls);
  expect(logueado).not.toContain('1004123456');
  expect(logueado).toContain('ER_DUP_ENTRY');
  child.mockRestore();
});
