const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../testing/servidorPrueba');

afterEach(cerrarServidores);

test('liga a 127.0.0.1 y la dirección ya existe al resolver (supertest no vuelve a escuchar en ::)', async () => {
  const app = express().get('/', (req, res) => res.send('ok'));
  const servidor = await servir(app);
  expect(servidor.address()).toMatchObject({ address: '127.0.0.1', family: expect.stringMatching(/4/) });
  expect(await servir(app)).toBe(servidor); // misma app → mismo servidor
  const r = await request(servidor).get('/');
  expect(r.text).toBe('ok');
});

test('cerrarServidores cierra y la siguiente llamada abre uno nuevo', async () => {
  const app = express();
  const primero = await servir(app);
  await cerrarServidores();
  expect(primero.listening).toBe(false);
  const segundo = await servir(app);
  expect(segundo).not.toBe(primero);
  expect(segundo.listening).toBe(true);
});
