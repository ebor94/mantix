jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => {
  const modelo = () => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() });
  return {
    SvArea: modelo(), SvGrupo: modelo(), SvProducto: modelo(), SvEstado: modelo(),
    SvResultado: modelo(), SvFuente: modelo(), SvPunto: modelo(), SvTipoEmpresa: modelo()
  };
});

const express = require('express');
const request = require('supertest');
const M = require('../src/sv/models');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const INTERNO = { success: false, error: 'INTERNAL_ERROR', message: 'Error interno. Intenta de nuevo en unos minutos.' };

// Arma el router igual que sv/routes/index.js: montar, capturar y al final el manejador.
function app() {
  const router = express.Router();
  router.use('/config', require('../src/sv/routes/config.routes'));
  capturarAsync(router);
  router.use(svErrorHandler);
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { usr_id: 1, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } }; next(); });
  a.use('/api/sv', router);
  return escuchar(a);
}

const duplicado = () => Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError', errors: [] });
const caida = () => Object.assign(new Error('connect ETIMEDOUT 10.0.0.5:3306'), { name: 'SequelizeConnectionError' });
const fila = (datos) => ({ ...datos, update: jest.fn(async () => {}) });

beforeEach(() => jest.resetAllMocks());
afterEach(cerrarTodos);

describe('editar un catálogo', () => {
  test.each([
    ['fuente', 'SvFuente', '/fuentes/5', { fuente_codigo: 'REFERIDO' }],
    ['punto',  'SvPunto',  '/puntos/5',  { punto_codigo: 'SJ' }]
  ])('%s con un código que ya existe responde 409', async (_n, modelo, ruta, body) => {
    const item = fila({});
    item.update.mockRejectedValue(duplicado());
    M[modelo].findByPk.mockResolvedValue(item);
    const r = await request(await app()).put(`/api/sv/config${ruta}`).send(body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Código duplicado' });
  });

  test('con la base caída responde 500 genérico', async () => {
    const item = fila({});
    item.update.mockRejectedValue(caida());
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).put('/api/sv/config/fuentes/5').send({ fuente_nombre: 'X' });
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('que no existe responde 404', async () => {
    M.SvFuente.findByPk.mockResolvedValue(null);
    const r = await request(await app()).put('/api/sv/config/fuentes/99').send({ fuente_nombre: 'X' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('NOT_FOUND');
  });

  test('con datos válidos lo actualiza', async () => {
    const item = fila({ fuente_id: 5 });
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).put('/api/sv/config/fuentes/5').send({ fuente_nombre: 'Encuestas' });
    expect(r.status).toBe(200);
    expect(item.update).toHaveBeenCalledWith({ fuente_nombre: 'Encuestas' });
    expect(r.body.data.fuente_id).toBe(5);
  });
});

describe('crear un catálogo', () => {
  const NUEVA = { fuente_area_id: 1, fuente_codigo: 'OTROS', fuente_nombre: 'Otros' };

  test('con un código que ya existe responde 409', async () => {
    M.SvFuente.create.mockRejectedValue(duplicado());
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Código duplicado');
  });

  test('con la base caída responde 500 genérico', async () => {
    M.SvFuente.create.mockRejectedValue(caida());
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('con datos válidos responde 201', async () => {
    M.SvFuente.create.mockResolvedValue({ fuente_id: 9 });
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ fuente_id: 9 });
  });
});

describe('listar, activar y bootstrap', () => {
  test('listar con la base caída responde 500 genérico', async () => {
    M.SvFuente.findAll.mockRejectedValue(caida());
    const r = await request(await app()).get('/api/sv/config/fuentes');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('listar devuelve los datos', async () => {
    M.SvFuente.findAll.mockResolvedValue([{ fuente_id: 1 }]);
    const r = await request(await app()).get('/api/sv/config/fuentes');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ fuente_id: 1 }]);
  });

  test('activar con la base caída responde 500 genérico', async () => {
    const item = fila({ fuente_activa: 1 });
    item.update.mockRejectedValue(caida());
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).patch('/api/sv/config/fuentes/5/toggle');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('activar alterna el estado', async () => {
    const item = fila({ fuente_activa: 1 });
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).patch('/api/sv/config/fuentes/5/toggle');
    expect(r.status).toBe(200);
    expect(item.update).toHaveBeenCalledWith({ fuente_activa: 0 });
  });

  test('bootstrap con la base caída responde 500 genérico', async () => {
    M.SvArea.findByPk.mockRejectedValue(caida());
    const r = await request(await app()).get('/api/sv/config/bootstrap?area_id=1');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('bootstrap de un área que no existe responde 404', async () => {
    M.SvArea.findByPk.mockResolvedValue(null);
    const r = await request(await app()).get('/api/sv/config/bootstrap?area_id=99');
    expect(r.status).toBe(404);
  });
});
