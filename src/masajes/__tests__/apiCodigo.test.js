// apiCodigo puede aparecer dos veces en la misma cadena (uno genérico en router.use y otro por ruta).
const mockInfo = [];
jest.mock('../../utils/logger', () => {
  const crear = (ctx = {}) => ({ child: (c) => crear({ ...ctx, ...c }), info: (...a) => mockInfo.push([ctx, ...a]), warn() {}, error() {}, debug() {} });
  return crear();
});

const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');

afterEach(() => { cerrarServidores(); mockInfo.length = 0; });

function app() {
  const a = express();
  a.use(apiCodigo('MSJ-GEN-000'));
  a.get('/x', apiCodigo('MSJ-RUT-001'), (req, res) => res.status(409).json({ success: false, message: 'conflicto' }));
  return a;
}

test('gana el código de la ruta, en el cuerpo y en la cabecera', async () => {
  const r = await request(await servir(app())).get('/x');
  expect(r.headers['x-msj-api']).toBe('MSJ-RUT-001');
  expect(r.body).toEqual({ success: false, error: 'MSJ-RUT-001', motivo: 'CONFLICTO', message: 'conflicto' });
});

test('la petición se registra UNA sola vez, sin el query string', async () => {
  await request(await servir(app())).get('/x?token=secreto&celular=573152884079');
  await new Promise((r) => setImmediate(r));
  const registros = mockInfo.filter(([, msg]) => msg === 'masajes request');
  expect(registros).toHaveLength(1);
  expect(registros[0][2]).toMatchObject({ ruta: '/x', status: 409 });
  expect(JSON.stringify(mockInfo)).not.toMatch(/secreto|573152884079/);
});
