/** GET /prospectos/agenda-mes?area_id: filtra por área, con svAreaGuard, validate y servicio reales. */
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/services/ventas.service', () => ({}));
jest.mock('../src/sv/models', () => ({
  sequelize: {}, SvProspecto: { findAll: jest.fn() }, SvUsuario: { findAll: jest.fn() },
  SvProspectoProducto: {}, SvProducto: {}, SvPersona: {}, SvEstado: {}, SvFuente: {},
  SvPunto: {}, SvLista: {}, SvGestion: {}, SvResultado: {}, SvEmpresa: {}
}));

const express = require('express');
const request = require('supertest');
const { SvProspecto } = require('../src/sv/models');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const usuario = (rol_codigo, extra = {}) => ({
  usr_id: 7, usr_area_id: 2, usr_grupo_id: 5, rol: { rol_codigo }, areasExtra: [], gruposExtra: [], ...extra
});

async function pedir(user, query) {
  const r = express.Router();
  r.use('/prospectos', svAreaGuard, require('../src/sv/routes/prospectos.routes'));
  capturarAsync(r);
  r.use(svErrorHandler);
  const a = express();
  a.use((req, res, next) => { req.user = user; next(); });
  a.use('/api/sv', r);
  return request(await escuchar(a)).get(`/api/sv/prospectos/agenda-mes?anio=2026&mes=11${query}`);
}
const where = () => SvProspecto.findAll.mock.calls[0][0].where;

beforeEach(() => {
  jest.resetAllMocks();
  SvProspecto.findAll.mockResolvedValue([]);
});
afterEach(cerrarTodos);

describe('area_id', () => {
  test('con area_id filtra por esa área', async () => {
    const res = await pedir(usuario('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 3 }] }), '&area_id=3');
    expect(res.status).toBe(200);
    expect(where().prosp_area_id).toBe(3);
  });

  test('sin area_id no filtra por área (como antes)', async () => {
    const res = await pedir(usuario('DIRECTOR_COMERCIAL'), '');
    expect(res.status).toBe(200);
    expect(where()).not.toHaveProperty('prosp_area_id');
  });

  test('sin area_id, ADMIN_AREA sigue con el área de su alcance', async () => {
    const res = await pedir(usuario('ADMIN_AREA'), '');
    expect(res.status).toBe(200);
    expect(where().prosp_area_id).toBe(2);
  });
});

describe('ADMIN_AREA solo puede pedir sus áreas', () => {
  const admin = usuario('ADMIN_AREA', { areasExtra: [{ area_id: 3 }] });

  test('su área propia → 200', async () => {
    const res = await pedir(admin, '&area_id=2');
    expect(res.status).toBe(200);
    expect(where().prosp_area_id).toBe(2);
  });
  test('un área extra → 200', async () => {
    const res = await pedir(admin, '&area_id=3');
    expect(res.status).toBe(200);
    expect(where().prosp_area_id).toBe(3);
  });
  test('un área ajena → 403 sin consultar', async () => {
    const res = await pedir(admin, '&area_id=4');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Área fuera de tu alcance' });
    expect(SvProspecto.findAll).not.toHaveBeenCalled();
  });
});

describe.each([
  ['SUPERVISOR', usuario('SUPERVISOR')],
  ['ASESOR', usuario('ASESOR')],
  ['DIRECTOR_COMERCIAL', usuario('DIRECTOR_COMERCIAL')],
  ['SUPER_ADMIN', usuario('SUPER_ADMIN', { usr_area_id: null, usr_grupo_id: null })]
])('%s con area_id', (_rol, user) => {
  test('→ 200, sin la restricción de área del ADMIN_AREA', async () => {
    const res = await pedir(user, '&area_id=4');
    expect(res.status).toBe(200);
    expect(where().prosp_area_id).toBe(4);
  });
});
