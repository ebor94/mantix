/**
 * /api/sv/tracking/jornadas con svAreaGuard y validate reales y el servicio real.
 * Sin base de datos: solo los modelos están simulados.
 */
const express = require('express');
const request = require('supertest');

const mockJornada  = { findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() };
const mockAusencia = { findOne: jest.fn() };
const mockPunto    = { findAll: jest.fn(), findOne: jest.fn(), bulkCreate: jest.fn() };

jest.mock('../src/sv/models', () => ({
  sequelize: {},
  SvJornada: mockJornada,
  SvJornadaAusencia: mockAusencia,
  SvTrackingPunto: mockPunto,
  SvUsuario: { findByPk: jest.fn(async () => ({ usr_id: 10 })) },
  SvGestion: {}, SvProspecto: {}, SvPersona: {}
}));

const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

const ASESOR = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR', rol_nivel: 5 } };
const SUPERV = { usr_id: 30, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'SUPERVISOR', rol_nivel: 3 } };
const SIN_ROL = { usr_id: 40, usr_area_id: 1, usr_grupo_id: 1 };
const DIRECTOR = { usr_id: 50, usr_area_id: 1, usr_grupo_id: null, rol: { rol_codigo: 'DIRECTOR_COMERCIAL', rol_nivel: 2 } };
const ADMIN  = { usr_id: 20, usr_area_id: 1, usr_grupo_id: null, rol: { rol_codigo: 'ADMIN_AREA', rol_nivel: 2 } };

const servidores = [];
async function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/tracking', require('../src/sv/routes/tracking.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  const server = a.listen(0, '127.0.0.1');
  servidores.push(server);
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  return server;
}
afterEach(async () => {
  await Promise.all(servidores.splice(0).map(s => new Promise(resolve => s.close(resolve))));
});

function jornadaDe(usrId) {
  return {
    jor_id: 'j1', jor_usr_id: usrId, jor_estado: 'activa',
    jor_fecha: new Date('2026-11-25T05:00:00Z'), jor_inicio_at: new Date('2026-11-25T13:00:00Z'),
    update: jest.fn(async function (v) { Object.assign(this, v); return this; }),
    increment: jest.fn()
  };
}

beforeEach(() => {
  [mockJornada, mockAusencia, mockPunto].forEach(m => Object.values(m).forEach(f => f.mockReset()));
  mockAusencia.findOne.mockResolvedValue(null);
  mockJornada.findAll.mockResolvedValue([]);
  mockJornada.create.mockImplementation(async (v) => ({ ...v }));
  mockPunto.findAll.mockResolvedValue([]);
  mockPunto.findOne.mockResolvedValue(null);
});

describe('POST /tracking/jornadas', () => {
  test('con ausencia hoy → 409 AUSENTE', async () => {
    mockAusencia.findOne.mockResolvedValue({ aus_id: 1 });
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas').send({});
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, error: 'AUSENTE' });
    expect(mockJornada.create).not.toHaveBeenCalled();
  });

  test('rol no operativo → 403 FORBIDDEN sin tocar nada', async () => {
    const r = await request(await app(DIRECTOR)).post('/api/sv/tracking/jornadas').send({});
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'FORBIDDEN', message: 'Tu rol no registra jornada' });
    expect(mockAusencia.findOne).not.toHaveBeenCalled();
    expect(mockJornada.findAll).not.toHaveBeenCalled();
    expect(mockJornada.create).not.toHaveBeenCalled();
  });

  test('sin nada → 201 con la jornada', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas').send({});
    expect(r.status).toBe(201);
    expect(r.body.data.jor_usr_id).toBe(10);
  });
});

describe('POST /tracking/jornadas/:id/puntos', () => {
  const punto = (extra = {}) => ({ ts: '2026-11-25T14:00:00Z', lat: 4.6, lng: -74.1, ...extra });

  test('a una jornada ajena → 403 sin guardar', async () => {
    mockJornada.findByPk.mockResolvedValue(jornadaDe(99));
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas/j1/puntos').send({ puntos: [punto()] });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('FORBIDDEN');
    expect(mockPunto.bulkCreate).not.toHaveBeenCalled();
  });

  test('jornada cerrada → 409 JORNADA_CERRADA', async () => {
    mockJornada.findByPk.mockResolvedValue({ ...jornadaDe(10), jor_estado: 'finalizada' });
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas/j1/puntos').send({ puntos: [punto()] });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('JORNADA_CERRADA');
  });

  test("source 'post_resume' → aceptado", async () => {
    mockJornada.findByPk.mockResolvedValue(jornadaDe(10));
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas/j1/puntos')
      .send({ puntos: [punto({ source: 'post_resume' })] });
    expect(r.status).toBe(200);
    expect(r.body.data.recibidos).toBe(1);
  });

  test('un source raro → 422', async () => {
    const r = await request(await app(ASESOR)).post('/api/sv/tracking/jornadas/j1/puntos')
      .send({ puntos: [punto({ source: 'raro' })] });
    expect(r.status).toBe(422);
  });
});

describe('PATCH /tracking/jornadas/:id/finalizar', () => {
  test('una ajena → 403 sin cerrarla', async () => {
    const j = jornadaDe(99);
    mockJornada.findByPk.mockResolvedValue(j);
    const r = await request(await app(ASESOR)).patch('/api/sv/tracking/jornadas/j1/finalizar').send({});
    expect(r.status).toBe(403);
    expect(j.update).not.toHaveBeenCalled();
    expect(j.jor_estado).toBe('activa');
  });

  test('la propia → 200 y queda finalizada', async () => {
    const j = jornadaDe(10);
    mockJornada.findByPk.mockResolvedValue(j);
    const r = await request(await app(ASESOR)).patch('/api/sv/tracking/jornadas/j1/finalizar').send({});
    expect(r.status).toBe(200);
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({ jor_estado: 'finalizada' }));
  });

  test('un rol de nivel 2 sí puede cerrar una ajena', async () => {
    const j = jornadaDe(99);
    mockJornada.findByPk.mockResolvedValue(j);
    const r = await request(await app(ADMIN)).patch('/api/sv/tracking/jornadas/j1/finalizar').send({});
    expect(r.status).toBe(200);
    expect(j.update).toHaveBeenCalled();
  });

  test.each([['nivel 3', SUPERV], ['sin rol', SIN_ROL]])('%s no cierra una ajena → 403', async (_n, user) => {
    const j = jornadaDe(99);
    mockJornada.findByPk.mockResolvedValue(j);
    const r = await request(await app(user)).patch('/api/sv/tracking/jornadas/j1/finalizar').send({});
    expect(r.status).toBe(403);
    expect(j.update).not.toHaveBeenCalled();
  });

  test('inexistente → 404', async () => {
    mockJornada.findByPk.mockResolvedValue(null);
    const r = await request(await app(ASESOR)).patch('/api/sv/tracking/jornadas/zz/finalizar').send({});
    expect(r.status).toBe(404);
  });
});
