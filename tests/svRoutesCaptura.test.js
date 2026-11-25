// Vigila que TODAS las rutas de ventas queden cubiertas por capturarAsync + svErrorHandler.
// Cada *.routes.js se reemplaza por un router con un handler async que falla; svAuth y
// svAreaGuard se dejan pasar. No se cargan modelos ni servicios.
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const DIR = path.join(__dirname, '../src/sv/routes');
const ARCHIVOS = fs.readdirSync(DIR).filter((f) => f.endsWith('.routes.js')).map((f) => f.replace(/\.js$/, ''));
const FUENTE = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');

// prefijo de montaje de cada archivo, leído de index.js
const PREFIJOS = new Map(
  [...FUENTE.matchAll(/router\.use\('([^']+)',[^\n]*require\('\.\/([\w-]+\.routes)'\)\)/g)].map((m) => [m[2], m[1]])
);

let server;
let index;

// Handlers normales (hasta 3 argumentos) que no llevan la marca de capturarAsync.
function sinCapturar(router, ruta = '') {
  return router.stack.flatMap((layer) => {
    if (layer.route) {
      return layer.route.stack
        .filter((l) => l.handle.length <= 3 && !l.handle[Symbol.for('sv.capturado')])
        .map((l) => `${(l.method || 'all').toUpperCase()} ${ruta}${layer.route.path}`);
    }
    if (Array.isArray(layer.handle.stack)) return sinCapturar(layer.handle, `${ruta}/…`);
    return layer.handle.length <= 3 && !layer.handle[Symbol.for('sv.capturado')] ? [`use ${ruta}`] : [];
  });
}

beforeAll(async () => {
  jest.resetModules();
  jest.doMock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
  jest.doMock('../src/sv/middleware/svAuth', () => ({ svAuth: (req, res, next) => next() }));
  jest.doMock('../src/sv/middleware/svAreaGuard', () => ({ svAreaGuard: (req, res, next) => next() }));
  for (const archivo of ARCHIVOS) {
    jest.doMock(`../src/sv/routes/${archivo}`, () => {
      const r = require('express').Router();
      r.get(`/__falla-${archivo}`, async () => { throw new Error('bum'); });
      return r;
    });
  }
  index = require('../src/sv/routes/index');
  const a = express();
  a.use('/api/sv', index);
  server = await escuchar(a);
});
afterAll(cerrarTodos);

test('todos los archivos de rutas están montados en index.js', () => {
  expect(ARCHIVOS.length).toBeGreaterThan(0);
  expect([...PREFIJOS.keys()].sort()).toEqual([...ARCHIVOS].sort());
});

test('no queda ningún handler sin capturar, venga de un archivo o esté escrito en index.js', () => {
  expect(sinCapturar(index)).toEqual([]);
});

test.each(ARCHIVOS)('%s: un handler async que falla responde 500 en vez de tumbar el proceso', async (archivo) => {
  const prefijo = PREFIJOS.get(archivo) === '/' ? '' : PREFIJOS.get(archivo);
  const r = await request(server).get(`/api/sv${prefijo}/__falla-${archivo}`);
  expect(r.status).toBe(500);
  expect(r.body.error).toBe('INTERNAL_ERROR');
});

test('/health sigue respondiendo', async () => {
  const r = await request(server).get('/api/sv/health');
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});
