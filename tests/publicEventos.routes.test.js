const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/services/publicEventos.service', () => ({
  obtenerPorHash: jest.fn(),
  registrar:      jest.fn()
}));
const svc    = require('../src/sv/services/publicEventos.service');
const routes = require('../src/sv/routes/publicEventos.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/sv/public', routes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /public/eventos/:hash', () => {
  test('200 con evento vigente', async () => {
    svc.obtenerPorHash.mockResolvedValue({
      evento_id: 500, evento_titulo: 'Feria', evento_fecha_hora: new Date(),
      evento_fecha_fin: new Date(Date.now() + 86400000), // mañana
      empresa: null
    });
    const r = await request(buildApp()).get('/api/sv/public/eventos/abc123');
    expect(r.status).toBe(200);
    expect(r.body.data.evento_id).toBe(500);
  });

  test('404 si hash no existe', async () => {
    svc.obtenerPorHash.mockResolvedValue(null);
    const r = await request(buildApp()).get('/api/sv/public/eventos/nada');
    expect(r.status).toBe(404);
  });

  test('410 si fecha_fin ya pasó', async () => {
    svc.obtenerPorHash.mockResolvedValue({
      evento_id: 500, evento_titulo: 'Vieja',
      evento_fecha_hora: new Date(Date.now() - 3 * 86400000),
      evento_fecha_fin:  new Date(Date.now() - 86400000), // ayer
      empresa: null
    });
    const r = await request(buildApp()).get('/api/sv/public/eventos/abc123');
    expect(r.status).toBe(410);
  });

  test('500 si el service lanza un error inesperado', async () => {
    svc.obtenerPorHash.mockRejectedValue(new Error('DB caída'));
    const r = await request(buildApp()).get('/api/sv/public/eventos/abc123');
    expect(r.status).toBe(500);
  });
});

describe('POST /public/eventos/:hash/registro', () => {
  test('201 con payload válido', async () => {
    svc.registrar.mockResolvedValue({ poolId: 7, dedup: false });
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'Juan Pérez', telefono: '+57 300 123 4567' });
    expect(r.status).toBe(201);
    expect(r.body.data.ok).toBe(true);
  });

  test('200 con dedup (mismo teléfono ya registrado)', async () => {
    svc.registrar.mockResolvedValue({ poolId: 5, dedup: true });
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'Ana', telefono: '3001111' });
    expect(r.status).toBe(200);
    expect(r.body.data.ok).toBe(true);
    expect(r.body.data.dedup).toBe(true);
  });

  test('422 con teléfono inválido', async () => {
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'X', telefono: 'no-es-tel' });
    expect(r.status).toBe(422);
  });

  test('404 si hash no existe', async () => {
    svc.registrar.mockRejectedValue(Object.assign(new Error('nope'), { code: 'NOT_FOUND' }));
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/nada/registro')
      .send({ nombre: 'Ana', telefono: '3001111' });
    expect(r.status).toBe(404);
  });

  test('410 si evento cerrado', async () => {
    svc.registrar.mockRejectedValue(Object.assign(new Error('cerrado'), { code: 'EVENTO_CERRADO' }));
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'Ana', telefono: '3001111' });
    expect(r.status).toBe(410);
  });

  // Regresión: antes del fix, un SequelizeUniqueConstraintError (race de dos
  // POSTs casi simultáneos) no coincidía con ningún `e.code` esperado y el
  // controller hacía `throw e`, convirtiéndose en un unhandled rejection que
  // tumbaba todo el proceso backend (server.js -> process.exit(1)).
  // El service ahora atrapa esa excepción y resuelve con dedup:true; el
  // controller debe devolver 200, nunca 500 ni tumbar el proceso.
  test('race: create() dispara SequelizeUniqueConstraintError → service ya lo resuelve como dedup, controller responde 200', async () => {
    svc.registrar.mockResolvedValue({ poolId: 99, dedup: true });
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'Race', telefono: '300-111-1111' });
    expect(r.status).toBe(200);
    expect(r.body.data.dedup).toBe(true);
  });

  test('500 si el service lanza un error desconocido (no crashea el proceso)', async () => {
    svc.registrar.mockRejectedValue(new Error('boom inesperado'));
    const r = await request(buildApp())
      .post('/api/sv/public/eventos/abc123/registro')
      .send({ nombre: 'Ana', telefono: '3001111' });
    expect(r.status).toBe(500);
  });
});
