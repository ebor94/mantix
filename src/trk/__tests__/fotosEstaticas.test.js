// Las fotos se guardan en TRK_FOTOS_PATH (que puede estar fuera de <backend>/uploads):
// Express debe servirlas en /uploads/trk/fotos sin depender de un alias de Nginx.
require('../testing/env');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
afterEach(cerrarServidores);
const app = require('../../app');

test('sirve las fotos desde TRK_FOTOS_PATH en /uploads/trk/fotos, con encabezados cross-origin', async () => {
  const dir = process.env.TRK_FOTOS_PATH;
  fs.mkdirSync(dir, { recursive: true });
  const nombre = '00000000-0000-4000-8000-000000000001.jpg';
  fs.writeFileSync(path.join(dir, nombre), 'jpg');
  const r = await request(await servir(app)).get(`/uploads/trk/fotos/${nombre}`);
  expect(r.status).toBe(200);
  expect(r.headers['cross-origin-resource-policy']).toBe('cross-origin');
  fs.unlinkSync(path.join(dir, nombre));
});

test('una foto inexistente sigue respondiendo 404', async () => {
  const r = await request(await servir(app)).get('/uploads/trk/fotos/no-existe.jpg');
  expect(r.status).toBe(404);
});
