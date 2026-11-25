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
  const a = express();
  a.use('/api/sv', require('../src/sv/routes/index'));
  server = await escuchar(a);
});
afterAll(cerrarTodos);

test('todos los archivos de rutas están montados en index.js', () => {
  expect(ARCHIVOS.length).toBeGreaterThan(0);
  expect([...PREFIJOS.keys()].sort()).toEqual([...ARCHIVOS].sort());
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
