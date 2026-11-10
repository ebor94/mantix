const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');
const { masajesErrorHandler } = require('../middleware/errorHandler');
const { montarParsersMasajes } = require('../middleware/parsers');
const MasajesError = require('../utils/MasajesError');

afterEach(cerrarServidores);

function appCon(manejador) {
  const app = express();
  app.use(express.json());
  app.post('/x', apiCodigo('MSJ-TST-001'), manejador);
  app.use('/', masajesErrorHandler);
  return app;
}

test('MasajesError produce el contrato con código, motivo y errores', async () => {
  const app = appCon((req, res, next) => next(
    new MasajesError(409, 'SLOT_OCUPADO', 'Esa franja acaba de ser tomada. Elige otra.', [{ campo: 'inicio' }]),
  ));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(409);
  expect(r.headers['x-msj-api']).toBe('MSJ-TST-001');
  expect(r.body).toEqual({
    success: false, error: 'MSJ-TST-001', motivo: 'SLOT_OCUPADO',
    message: 'Esa franja acaba de ser tomada. Elige otra.', errors: [{ campo: 'inicio' }],
  });
});

test('MasajesError es un AppError operativo', () => {
  const AppError = require('../../utils/AppError');
  const e = new MasajesError(404, 'NO_ENCONTRADA', 'La cita no existe.');
  expect(e).toBeInstanceOf(AppError);
  expect(e).toMatchObject({ statusCode: 404, motivo: 'NO_ENCONTRADA', isOperational: true });
});

test('un error inesperado responde 500 genérico sin filtrar detalles', async () => {
  const app = appCon(() => {
    const err = new Error("Duplicate entry '57315' for key 'uq_msj_citas_cupo_key'");
    err.sqlMessage = err.message;
    throw err;
  });
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(500);
  expect(r.body).toEqual({ success: false, error: 'MSJ-TST-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
  expect(JSON.stringify(r.body)).not.toMatch(/Duplicate|57315|stack/);
});

test('una respuesta de error directa recibe código y motivo según el status', async () => {
  const app = appCon((req, res) => res.status(403).json({ success: false, message: 'Sin permiso' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body).toEqual({ success: false, error: 'MSJ-TST-001', motivo: 'SIN_PERMISO', message: 'Sin permiso' });
});

test('503 directo lleva motivo NO_DISPONIBLE', async () => {
  const app = appCon((req, res) => res.status(503).json({ success: false, message: 'Caído' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body.motivo).toBe('NO_DISPONIBLE');
});

test('si la respuesta ya fue enviada delega en next sin enviar otra vez', async () => {
  const delegados = [];
  const app = express();
  app.get('/x', apiCodigo('MSJ-TST-001'), (req, res, next) => { res.write('x'); next(new Error('tarde')); });
  app.use('/', masajesErrorHandler);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => { delegados.push(err.message); res.end(); });
  const r = await request(await servir(app)).get('/x');
  expect(r.status).toBe(200);
  expect(r.text).toBe('x');
  expect(delegados).toEqual(['tarde']);
});

describe('parsers del módulo (montados en app.js antes de los globales de 10 MB)', () => {
  function appConParsers() {
    const app = express();
    montarParsersMasajes(app);
    app.use(express.json({ limit: '10mb' })); // el global de Mantix
    app.post('/api/masajes/v1/x', (req, res) => res.json({ success: true, data: req.body }));
    app.post('/api/otro', (req, res) => res.json({ success: true, largo: JSON.stringify(req.body).length }));
    return app;
  }

  test('JSON inválido → 400 VALIDACION con el contrato del módulo', async () => {
    const r = await request(await servir(appConParsers()))
      .post('/api/masajes/v1/x').set('Content-Type', 'application/json').send('{malo');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, error: 'MSJ-SIN-CODIGO', motivo: 'VALIDACION', message: 'JSON inválido' });
  });

  test('cuerpo de más de 10 KB → 413 aunque el global permita 10 MB', async () => {
    const r = await request(await servir(appConParsers()))
      .post('/api/masajes/v1/x').send({ relleno: 'x'.repeat(11 * 1024) });
    expect(r.status).toBe(413);
    expect(r.body.motivo).toBe('VALIDACION');
  });

  test('un cuerpo pequeño llega parseado', async () => {
    const r = await request(await servir(appConParsers())).post('/api/masajes/v1/x').send({ a: 1 });
    expect(r.body).toEqual({ success: true, data: { a: 1 } });
  });

  test('no afecta a otras rutas de Mantix', async () => {
    const r = await request(await servir(appConParsers())).post('/api/otro').send({ relleno: 'x'.repeat(11 * 1024) });
    expect(r.status).toBe(200);
  });
});
