const express = require('express');
const request = require('supertest');
const logger = require('../../../utils/logger');
const apiCodigo = require('../apiCodigo');

test('cada request deja una línea de log con api_codigo, status y duración', async () => {
  const info = jest.fn();
  const child = jest.spyOn(logger, 'child').mockReturnValue({ info, warn: jest.fn(), error: jest.fn() });
  const app = express();
  app.get('/x', apiCodigo('TRK-EVT-901'), (req, res) => res.status(204).end());
  await request(app).get('/x');
  expect(child).toHaveBeenCalledWith({ modulo: 'trk', api_codigo: 'TRK-EVT-901' });
  expect(info).toHaveBeenCalledWith('trk request', expect.objectContaining({ metodo: 'GET', status: 204, ms: expect.any(Number) }));
  child.mockRestore();
});
