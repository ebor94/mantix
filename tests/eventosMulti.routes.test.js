const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/services/eventosAgenda.service', () => ({
  crear:                       jest.fn(),
  actualizar:                  jest.fn(),
  actualizarMetricasAsistente: jest.fn(),
  resumen:                     jest.fn(),
  eliminar:                    jest.fn(),
  getOne:                      jest.fn(),
  marcarCompletado:            jest.fn()
}));
jest.mock('../src/sv/services/eventoPool.service', () => ({
  listar: jest.fn(),
  asignar: jest.fn()
}));
jest.mock('../src/sv/services/agenda.service', () => ({}));
jest.mock('../src/sv/models', () => ({}));

const svEv   = require('../src/sv/services/eventosAgenda.service');
const svPool = require('../src/sv/services/eventoPool.service');
const routes = require('../src/sv/routes/agenda.routes');

function buildApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; req.scope = {}; next(); });
  app.use('/api/sv', routes);
  return app;
}

const jefe = { usr_id: 20, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };

describe('PUT /eventos-agenda/:id', () => {
  test('200 con payload válido', async () => {
    svEv.actualizar.mockResolvedValue({ evento_id: 500 });
    const r = await request(buildApp(jefe))
      .put('/api/sv/eventos-agenda/500')
      .send({ titulo: 'Nuevo título' });
    expect(r.status).toBe(200);
    expect(svEv.actualizar).toHaveBeenCalledWith(500,
      expect.objectContaining({ titulo: 'Nuevo título' }), jefe);
  });
});

describe('GET /eventos-agenda/:id/pool', () => {
  test('200 devuelve lista', async () => {
    svPool.listar.mockResolvedValue([{ pool_id: 1 }, { pool_id: 2 }]);
    const r = await request(buildApp(jefe)).get('/api/sv/eventos-agenda/500/pool');
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(2);
  });

  test('propaga ?asignado=0', async () => {
    svPool.listar.mockResolvedValue([]);
    await request(buildApp(jefe)).get('/api/sv/eventos-agenda/500/pool?asignado=0');
    expect(svPool.listar).toHaveBeenCalledWith(500, expect.objectContaining({ asignado: '0' }), jefe);
  });
});

describe('POST /eventos-agenda/:id/pool/:pool_id/asignar', () => {
  test('200 al asignar', async () => {
    svPool.asignar.mockResolvedValue({ pool: { pool_id: 7 }, prospecto: { prosp_id: 900 } });
    const r = await request(buildApp(jefe))
      .post('/api/sv/eventos-agenda/500/pool/7/asignar')
      .send({ asesor_id: 15 });
    expect(r.status).toBe(200);
    expect(r.body.data.prospecto.prosp_id).toBe(900);
  });

  test('422 con asesor_id faltante', async () => {
    const r = await request(buildApp(jefe))
      .post('/api/sv/eventos-agenda/500/pool/7/asignar').send({});
    expect(r.status).toBe(422);
  });

  test('409 si YA_ASIGNADO', async () => {
    svPool.asignar.mockRejectedValue(Object.assign(new Error('ya'), { code: 'YA_ASIGNADO' }));
    const r = await request(buildApp(jefe))
      .post('/api/sv/eventos-agenda/500/pool/7/asignar').send({ asesor_id: 15 });
    expect(r.status).toBe(409);
  });
});

describe('PATCH /eventos-agenda/asistentes/:eva_id/metricas', () => {
  test('200 con estado válido', async () => {
    svEv.actualizarMetricasAsistente.mockResolvedValue({ eva_id: 77 });
    const r = await request(buildApp(jefe))
      .patch('/api/sv/eventos-agenda/asistentes/77/metricas')
      .send({ estado: 'ASISTIO', leads_captados: 5 });
    expect(r.status).toBe(200);
  });

  test('422 con estado inválido', async () => {
    const r = await request(buildApp(jefe))
      .patch('/api/sv/eventos-agenda/asistentes/77/metricas')
      .send({ estado: 'BLAH' });
    expect(r.status).toBe(422);
  });
});

describe('GET /eventos-agenda/:id/resumen', () => {
  test('200 devuelve totales + por_asesor', async () => {
    svEv.resumen.mockResolvedValue({
      total_registros: 10, total_asignados: 6, total_pendientes: 4,
      por_asesor: [{ usr_id: 10, leads: 5 }]
    });
    const r = await request(buildApp(jefe)).get('/api/sv/eventos-agenda/500/resumen');
    expect(r.status).toBe(200);
    expect(r.body.data.total_pendientes).toBe(4);
  });
});
