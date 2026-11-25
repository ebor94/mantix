const express = require('express');
const request = require('supertest');

jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/services/salas.service', () => ({
  listar: jest.fn(), obtener: jest.fn(), atender: jest.fn(), registrarVisita: jest.fn()
}));

const salas = require('../src/sv/services/salas.service');
const SalaError = require('../src/sv/services/salaError');

const ASESOR = { usr_id: 7, usr_area_id: 1, rol: { rol_codigo: 'ASESOR' } };

function app(user = ASESOR) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use('/api/sv/salas', require('../src/sv/routes/salas.routes'));
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

beforeEach(() => jest.resetAllMocks());

describe('rutas /sv/salas', () => {
  test('GET /homenajes devuelve la lista del servicio', async () => {
    salas.listar.mockResolvedValue([{ id: 55 }]);
    const r = await request(app()).get('/api/sv/salas/homenajes');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: [{ id: 55 }] });
    expect(salas.listar).toHaveBeenCalledWith(ASESOR);
  });

  test('GET /homenajes/:id con id no numérico responde 404 sin llamar al servicio', async () => {
    const r = await request(app()).get('/api/sv/salas/homenajes/abc');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('HOMENAJE_NO_ENCONTRADO');
    expect(salas.obtener).not.toHaveBeenCalled();
  });

  test('GET /homenajes/:id pasa el id como número', async () => {
    salas.obtener.mockResolvedValue({ id: 56 });
    const r = await request(app()).get('/api/sv/salas/homenajes/56');
    expect(r.status).toBe(200);
    expect(salas.obtener).toHaveBeenCalledWith(56, ASESOR);
  });

  test('un SalaError responde con su estado, código y mensaje', async () => {
    salas.atender.mockRejectedValue(new SalaError('FORBIDDEN', 403, 'Solo los asesores de Prenecesidad atienden contratantes'));
    const r = await request(app()).post('/api/sv/salas/homenajes/55/atender').send({});
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Solo los asesores de Prenecesidad atienden contratantes' });
  });

  test('POST atender pasa solo nombre y teléfono', async () => {
    salas.atender.mockResolvedValue({ prosp_id: 905 });
    const r = await request(app()).post('/api/sv/salas/homenajes/55/atender')
      .send({ nombre: 'Ana', telefono: '3125550101', prosp_asesor_id: 99 });
    expect(r.status).toBe(200);
    expect(salas.atender).toHaveBeenCalledWith(55, ASESOR, { nombre: 'Ana', telefono: '3125550101' });
  });

  test('POST visitas exige gest_resultado_id', async () => {
    const r = await request(app()).post('/api/sv/salas/homenajes/57/visitas').send({ gest_comentario: 'x' });
    expect(r.status).toBe(422);
    expect(salas.registrarVisita).not.toHaveBeenCalled();
  });

  test('POST visitas descarta gest_prosp_id, gest_asesor_id y gest_canal', async () => {
    salas.registrarVisita.mockResolvedValue({ gest_id: 77 });
    const r = await request(app()).post('/api/sv/salas/homenajes/57/visitas')
      .send({ gest_resultado_id: 3, gest_prosp_id: 1, gest_asesor_id: 99, gest_canal: 'llamada' });
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ gest_id: 77 });
    const body = salas.registrarVisita.mock.calls[0][2];
    expect(body).toEqual(expect.objectContaining({ gest_resultado_id: 3 }));
    expect(body).not.toHaveProperty('gest_prosp_id');
    expect(body).not.toHaveProperty('gest_asesor_id');
    expect(body).not.toHaveProperty('gest_canal');
  });

  test('el reintento de una venta ya registrada responde 409 CONFLICT', async () => {
    const r = express.Router();
    r.use('/salas', require('../src/sv/routes/salas.routes'));
    r.use(require('../src/sv/middleware/svErrorHandler').svErrorHandler);
    const a = express();
    a.use(express.json());
    a.use((req, res, next) => { req.user = ASESOR; next(); });
    a.use('/api/sv', r);
    salas.registrarVisita.mockRejectedValue(Object.assign(new Error('Esta venta ya quedó registrada. Recarga la ficha para verla'), { code: 'CONFLICT' }));

    const res = await request(a).post('/api/sv/salas/homenajes/57/visitas').send({ gest_resultado_id: 3 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'CONFLICT', message: 'Esta venta ya quedó registrada. Recarga la ficha para verla' });
  });

  test('un error inesperado llega al manejador de errores (next) sin tumbar el proceso', async () => {
    salas.listar.mockRejectedValue(new Error('db caída'));
    const r = await request(app()).get('/api/sv/salas/homenajes');
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('INTERNAL_ERROR');
  });
});
