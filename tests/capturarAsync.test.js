jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const express = require('express');
const request = require('supertest');
const logger = require('../src/utils/logger');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

let manejador;

function montar(router) {
  const a = express();
  a.use(router);
  // Manejador de cuatro argumentos; jest.fn no sirve directo porque su length es 0.
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => manejador(err, req, res, next));
  return escuchar(a);
}

beforeEach(() => {
  jest.clearAllMocks();
  manejador = jest.fn((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(500).json({ atrapado: err.message });
  });
});
afterEach(cerrarTodos);

describe('capturarAsync', () => {
  test('un handler async que falla llega al manejador de errores', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('bum'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ atrapado: 'bum' });
  });

  test('alcanza subrouters anidados', async () => {
    const nieto = express.Router();
    nieto.post('/z', async () => { throw new Error('nieto'); });
    const hijo = express.Router();
    hijo.use('/y', nieto);
    const r = express.Router();
    r.use('/x', hijo);
    const res = await request(await montar(capturarAsync(r))).post('/x/y/z');
    expect(res.body).toEqual({ atrapado: 'nieto' });
  });

  test('alcanza middlewares async montados con use', async () => {
    const r = express.Router();
    r.use(async () => { throw new Error('middleware'); });
    r.get('/x', (req, res) => res.json({ ok: 1 }));
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'middleware' });
  });

  test('alcanza cada handler de una misma ruta', async () => {
    const r = express.Router();
    r.get('/x', async (req, res, next) => next(), async () => { throw new Error('segundo'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'segundo' });
  });

  test('un rechazo sin motivo también es un error', async () => {
    const r = express.Router();
    // eslint-disable-next-line prefer-promise-reject-errors
    r.get('/x', async () => Promise.reject());
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ atrapado: 'Promesa rechazada sin motivo' });
  });

  test('un error síncrono sigue llegando al manejador', async () => {
    const r = express.Router();
    r.get('/x', () => { throw new Error('sincrono'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'sincrono' });
  });

  test('las respuestas correctas no cambian', async () => {
    const r = express.Router();
    r.get('/sync', (req, res) => res.json({ tipo: 'sync' }));
    r.get('/async/:id', async (req, res) => res.status(201).json({ id: req.params.id }));
    const server = await montar(capturarAsync(r));
    expect((await request(server).get('/sync')).body).toEqual({ tipo: 'sync' });
    const res = await request(server).get('/async/7');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: '7' });
    expect(manejador).not.toHaveBeenCalled();
  });

  test('no toca los manejadores de error del propio router', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('bum'); });
    // eslint-disable-next-line no-unused-vars
    r.use((err, req, res, next) => res.status(418).json({ propio: err.message }));
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ propio: 'bum' });
  });

  test('aplicarlo dos veces no repite el error', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('una vez'); });
    capturarAsync(r);
    capturarAsync(r);
    await request(await montar(r)).get('/x');
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  test('si falla después de responder, la respuesta llega y solo se anota', async () => {
    const r = express.Router();
    r.get('/x', async (req, res) => { res.json({ ok: 1 }); throw new Error('tarde'); });
    const res = await request(await montar(capturarAsync(r))).get('/x?telefono=3001234567');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: 1 });
    expect(manejador).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual(expect.objectContaining({ message: 'tarde', method: 'GET', path: '/x' }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('3001234567');
  });

  test('si falla con la respuesta a medias, se corta esa petición y el servidor sigue', async () => {
    const r = express.Router();
    r.get('/medias', async (req, res) => { res.write('a'); throw new Error('a medias'); });
    r.get('/ok', (req, res) => res.json({ ok: 1 }));
    const server = await montar(capturarAsync(r));
    await expect(request(server).get('/medias')).rejects.toThrow();
    expect((await request(server).get('/ok')).body).toEqual({ ok: 1 });
  });
});
