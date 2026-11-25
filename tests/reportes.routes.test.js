/** Quién puede ver cada reporte, con el svAreaGuard, el validate y el acceso.js reales. */
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({ SvUsuario: { findAll: jest.fn() }, SvGrupo: { findByPk: jest.fn() } }));
jest.mock('../src/sv/services/reportes.service', () => ({ dashboardArea: jest.fn(), reporteAsesor: jest.fn(), reporteEquipo: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { Op } = require('sequelize');
const M = require('../src/sv/models');
const reportes = require('../src/sv/services/reportes.service');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

// Grupo → área. El 1 y el 11 son de Prenecesidad (1); el 2 y el 5, de Empresariales (2);
// el 3 y el 13, de PAP (3); el 4, de SVC (4).
const GRUPOS = { 1: 1, 11: 1, 2: 2, 5: 2, 3: 3, 13: 3, 4: 4 };
const USUARIOS = [[7, 1], [8, 1], [9, 11], [20, 2], [21, 2], [25, 5], [30, 3], [31, 3], [39, 13], [40, 4]]
  .map(([usr_id, usr_grupo_id]) => ({ usr_id, usr_grupo_id, usr_area_id: GRUPOS[usr_grupo_id], usr_activo: 1 }));

const usuario = (rol_codigo, usr_id, extra = {}) => ({
  ...USUARIOS.find((u) => u.usr_id === usr_id), rol: { rol_codigo }, gruposExtra: [], areasExtra: [], ...extra
});
const areas = (...ids) => ({ areasExtra: ids.map((area_id) => ({ area_id })) });
const grupos = (...ids) => ({ gruposExtra: ids.map((grupo_id) => ({ grupo_id })) });

const ASESOR      = usuario('ASESOR', 7, { ...grupos(2), ...areas(2) }); // con acceso cruzado sigue viendo solo lo suyo
const AGENTE      = usuario('AGENTE_SVC', 7);
const SUPERVISOR  = usuario('SUPERVISOR', 7);
const MULTIGRUPO  = usuario('SUPERVISOR', 20, { ...grupos(2, 3, 4, 5), ...areas(2, 3, 4) }); // Supervisor Previsión (005, 007 y 010)
const COORDINADOR = usuario('COORDINADOR_PREVISION', 20, areas(3));
const JEFE_PAP    = usuario('JEFE_PAP', 30);
const ADMIN       = usuario('ADMIN_AREA', 7);
const ADMIN_COM   = usuario('ADMIN_AREA', 7, areas(2, 3));
const GERENTE     = usuario('GERENTE_GENERAL', 7, { usr_grupo_id: null, ...areas(1, 2, 3, 4) });
const GERENTE_1   = usuario('GERENTE_GENERAL', 7, { usr_grupo_id: null });
const DIRECTOR    = usuario('DIRECTOR_COMERCIAL', 20, areas(3, 4)); // todo menos Prenecesidad
const SUPER       = usuario('SUPER_ADMIN', 7, { usr_area_id: null, usr_grupo_id: null });
const OTRO_ROL    = usuario('ROL_NUEVO', 7);

async function pedir(user, ruta) {
  const r = express.Router();
  r.use('/reportes', svAreaGuard, require('../src/sv/routes/reportes.routes'));
  capturarAsync(r);
  r.use(svErrorHandler);
  const a = express();
  a.use((req, res, next) => { req.user = user; next(); });
  a.use('/api/sv', r);
  return request(await escuchar(a)).get(`/api/sv/reportes/${ruta}`);
}

const cumple = (cond, valor) => (cond?.[Op.in] ? cond[Op.in].includes(valor) : cond === valor);

beforeEach(() => {
  jest.resetAllMocks();
  M.SvUsuario.findAll.mockImplementation(async ({ where }) =>
    USUARIOS.filter((u) => Object.entries(where).every(([campo, cond]) => cumple(cond, u[campo]))));
  M.SvGrupo.findByPk.mockImplementation(async (id) => (GRUPOS[id] ? { grupo_id: id, grupo_area_id: GRUPOS[id] } : null));
  reportes.dashboardArea.mockResolvedValue({ kpis: {} });
  reportes.reporteAsesor.mockResolvedValue({ totales: {} });
  reportes.reporteEquipo.mockResolvedValue({ asesores: [] });
});
afterEach(cerrarTodos);

// Cada fila: rol, usuario, ids [propio, mismo grupo, otro grupo de la misma área, otra área] y estados.
const expandir = (tabla, columnas) => tabla.flatMap(([rol, user, ids, estados]) =>
  ids.map((id, i) => [rol, columnas[i], estados[i], user, id]));

const PERSONAS = ['el propio', 'uno de su grupo', 'uno de otro grupo de su área', 'uno de otra área'];
const ASESORES = expandir([
  ['ASESOR',                        ASESOR,      [7, 8, 9, 20],   [200, 403, 403, 403]],
  ['AGENTE_SVC',                    AGENTE,      [7, 8, 9, 20],   [200, 403, 403, 403]],
  ['SUPERVISOR',                    SUPERVISOR,  [7, 8, 9, 20],   [200, 200, 403, 403]],
  ['SUPERVISOR de varios grupos',   MULTIGRUPO,  [20, 21, 25, 8], [200, 200, 200, 403]],
  ['COORDINADOR_PREVISION',         COORDINADOR, [20, 21, 25, 8], [200, 200, 403, 403]],
  ['JEFE_PAP',                      JEFE_PAP,    [30, 31, 39, 8], [200, 200, 403, 403]],
  ['ADMIN_AREA',                    ADMIN,       [7, 8, 9, 20],   [200, 200, 200, 403]],
  ['ADMIN_AREA con otras áreas',    ADMIN_COM,   [7, 8, 9, 20],   [200, 200, 200, 200]],
  ['GERENTE_GENERAL',               GERENTE,     [7, 8, 9, 20],   [200, 200, 200, 200]],
  ['GERENTE_GENERAL de un área',    GERENTE_1,   [7, 8, 9, 20],   [200, 200, 200, 403]],
  ['DIRECTOR_COMERCIAL',            DIRECTOR,    [20, 21, 25, 8], [200, 200, 200, 403]],
  ['SUPER_ADMIN',                   SUPER,       [7, 8, 9, 20],   [200, 200, 200, 200]],
  ['un rol desconocido',            OTRO_ROL,    [7, 8, 9, 20],   [200, 403, 403, 403]]
], PERSONAS);

const EQUIPOS = ['el propio', 'otro de su área', 'uno de otra área', 'uno que no existe'];
const GRUPOS_POR_ROL = expandir([
  ['SUPERVISOR',                    SUPERVISOR,  [1, 11, 2, 99],  [200, 403, 403, 404]],
  ['SUPERVISOR de varios grupos',   MULTIGRUPO,  [2, 5, 1, 99],   [200, 200, 403, 404]],
  ['COORDINADOR_PREVISION',         COORDINADOR, [2, 5, 3, 99],   [200, 403, 403, 404]],
  ['ADMIN_AREA',                    ADMIN,       [1, 11, 2, 99],  [200, 200, 403, 404]],
  ['ADMIN_AREA con otras áreas',    ADMIN_COM,   [1, 11, 2, 99],  [200, 200, 200, 404]],
  ['GERENTE_GENERAL',               GERENTE,     [1, 11, 2, 99],  [200, 200, 200, 404]],
  ['GERENTE_GENERAL de un área',    GERENTE_1,   [1, 11, 2, 99],  [200, 200, 403, 404]],
  ['DIRECTOR_COMERCIAL',            DIRECTOR,    [2, 5, 1, 99],   [200, 200, 403, 404]],
  ['SUPER_ADMIN',                   SUPER,       [1, 11, 2, 99],  [200, 200, 200, 404]]
], EQUIPOS);

describe('GET /asesor/:id', () => {
  test.each(ASESORES)('%s, %s → %i', async (_rol, _cual, estado, user, id) => {
    const r = await pedir(user, `asesor/${id}?desde=2026-11-01&hasta=2026-11-30`);
    expect(r.status).toBe(estado);
    expect(reportes.reporteAsesor).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
    if (estado === 200) expect(reportes.reporteAsesor.mock.calls[0][0]).toBe(id);
    else expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
  });

  test.each([['PanelDia y MisMetricas', ASESOR], ['PanelSvc', AGENTE], ['MisMetricasEmp', COORDINADOR]])('%s piden el propio: se ve sin consultar a nadie más', async (_n, user) => {
    const r = await pedir(user, `asesor/${user.usr_id}?mes=11&anio=2026`);
    expect(r.status).toBe(200);
    expect(reportes.reporteAsesor).toHaveBeenCalledWith(user.usr_id, { mes: 11, anio: 2026, desde: undefined, hasta: undefined });
    expect(M.SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('un asesor inactivo no está entre los accesibles, pero cada quien ve el suyo', async () => {
    M.SvUsuario.findAll.mockResolvedValue([]);
    expect((await pedir(SUPERVISOR, 'asesor/8')).status).toBe(403);
    expect((await pedir(SUPERVISOR, 'asesor/7')).status).toBe(200);
  });

  test('compara como número aunque los ids lleguen como texto', async () => {
    M.SvUsuario.findAll.mockResolvedValue([{ usr_id: '8' }]);
    expect((await pedir({ ...SUPERVISOR, usr_id: '7' }, 'asesor/8')).status).toBe(200);
    expect((await pedir({ ...SUPERVISOR, usr_id: '7' }, 'asesor/7')).status).toBe(200);
    expect((await pedir({ ...SUPERVISOR, usr_id: '7' }, 'asesor/80')).status).toBe(403);
  });
});

describe('GET /equipo', () => {
  test.each(GRUPOS_POR_ROL)('%s, %s → %i', async (_rol, _cual, estado, user, id) => {
    const r = await pedir(user, `equipo?grupo_id=${id}&desde=2026-11-01&hasta=2026-11-30`);
    expect(r.status).toBe(estado);
    expect(reportes.reporteEquipo).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
    if (estado === 200) expect(reportes.reporteEquipo.mock.calls[0][0].grupoId).toBe(id);
    if (estado === 403) expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Grupo fuera de tu alcance' });
    if (estado === 404) expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Grupo no encontrado' });
  });

  test.each([['ASESOR', ASESOR], ['AGENTE_SVC', AGENTE], ['un rol desconocido', OTRO_ROL]])('%s no ve ningún equipo, ni el suyo', async (_n, user) => {
    for (const id of [1, 11, 2, 99]) {
      const r = await pedir(user, `equipo?grupo_id=${id}`);
      expect(r.status).toBe(403);
      expect(r.body.message).toBe('Solo SUPERVISOR+ pueden ver el equipo');
    }
    expect(reportes.reporteEquipo).not.toHaveBeenCalled();
  });

  test.each([3, 13, 1, 99])('JEFE_PAP ve siempre el grupo PAP (pide el %i)', async (id) => {
    expect((await pedir(JEFE_PAP, `equipo?grupo_id=${id}`)).status).toBe(200);
    expect(reportes.reporteEquipo.mock.calls[0][0].grupoId).toBe(3);
  });

  test.each([
    ['SUPERVISOR de varios grupos', MULTIGRUPO, [2, 3, 4, 5]], ['SUPERVISOR', SUPERVISOR, [1]],
    ['COORDINADOR_PREVISION', usuario('COORDINADOR_PREVISION', 20, grupos(5)), [2, 5]], ['JEFE_PAP', JEFE_PAP, [3]],
    ['ADMIN_AREA', ADMIN, [1]], ['DIRECTOR_COMERCIAL', usuario('DIRECTOR_COMERCIAL', 20, { ...grupos(2, 3, 4), ...areas(3, 4) }), [2, 3, 4]]
  ])('el panel de %s abre todos sus grupos', async (_n, user, ids) => {
    for (const id of ids) expect((await pedir(user, `equipo?grupo_id=${id}`)).status).toBe(200);
    expect(reportes.reporteEquipo.mock.calls.map(([o]) => o.grupoId)).toEqual(ids);
  });

  test('compara como número aunque los ids lleguen como texto', async () => {
    expect((await pedir({ ...SUPERVISOR, usr_grupo_id: '1' }, 'equipo?grupo_id=1')).status).toBe(200);
    expect((await pedir({ ...ADMIN, usr_area_id: '1' }, 'equipo?grupo_id=11')).status).toBe(200);
    expect((await pedir({ ...ADMIN, usr_area_id: '1' }, 'equipo?grupo_id=2')).status).toBe(403);
  });
});

describe('GET /dashboard', () => {
  const alcance = () => {
    const { areaId, grupoId, asesorId } = reportes.dashboardArea.mock.calls[0][0].scope;
    return { areaId, grupoId, asesorId };
  };

  test.each([
    ['ASESOR', ASESOR, { areaId: 1, grupoId: 1, asesorId: 7 }], ['SUPERVISOR', SUPERVISOR, { areaId: 1, grupoId: 1, asesorId: null }],
    ['JEFE_PAP', JEFE_PAP, { areaId: 3, grupoId: 3, asesorId: null }], ['ADMIN_AREA', ADMIN, { areaId: 1, grupoId: null, asesorId: null }],
    ['SUPER_ADMIN', SUPER, { areaId: null, grupoId: null, asesorId: null }]
  ])('%s sin pedir nada ve su alcance de siempre', async (_n, user, esperado) => {
    expect((await pedir(user, 'dashboard?fecha=2026-11-24')).status).toBe(200);
    expect(alcance()).toEqual(esperado);
  });

  describe('asesor_id', () => {
    const SUPERVISORES = ASESORES.filter(([, , , user]) => ![ASESOR, AGENTE, OTRO_ROL].includes(user));

    test.each(SUPERVISORES)('%s, %s → %i', async (_rol, _cual, estado, user, id) => {
      const r = await pedir(user, `dashboard?asesor_id=${id}`);
      expect(r.status).toBe(estado);
      expect(reportes.dashboardArea).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
      if (estado === 200) expect(alcance().asesorId).toBe(id);
      else expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    });
  });

  describe('grupo_id', () => {
    test.each(GRUPOS_POR_ROL)('%s, %s → %i', async (_rol, _cual, estado, user, id) => {
      const r = await pedir(user, `dashboard?grupo_id=${id}`);
      expect(r.status).toBe(estado);
      expect(reportes.dashboardArea).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
      if (estado === 200) expect(alcance()).toEqual(expect.objectContaining({ grupoId: id, asesorId: null }));
      if (estado === 403) expect(r.body.message).toBe('Grupo fuera de tu alcance');
      if (estado === 404) expect(r.body.message).toBe('Grupo no encontrado');
    });
  });

  describe('area_id', () => {
    test.each([
      ['ADMIN_AREA', 1, 200, ADMIN], ['ADMIN_AREA', 2, 403, ADMIN],
      ['ADMIN_AREA con otras áreas', 2, 200, ADMIN_COM], ['ADMIN_AREA con otras áreas', 4, 403, ADMIN_COM],
      ['GERENTE_GENERAL', 4, 200, GERENTE], ['GERENTE_GENERAL de un área', 2, 403, GERENTE_1],
      ['DIRECTOR_COMERCIAL', 4, 200, DIRECTOR], ['DIRECTOR_COMERCIAL', 1, 403, DIRECTOR],
      ['SUPER_ADMIN', 2, 200, SUPER],
      // Un área completa es más que sus grupos.
      ['SUPERVISOR', 1, 403, SUPERVISOR], ['SUPERVISOR de varios grupos', 3, 403, MULTIGRUPO],
      ['COORDINADOR_PREVISION', 2, 403, COORDINADOR], ['COORDINADOR_PREVISION', 3, 403, COORDINADOR]
    ])('%s pide el área %i → %i', async (_rol, id, estado, user) => {
      const r = await pedir(user, `dashboard?area_id=${id}`);
      expect(r.status).toBe(estado);
      expect(reportes.dashboardArea).toHaveBeenCalledTimes(estado === 200 ? 1 : 0);
      if (estado === 200) expect(alcance()).toEqual({ areaId: id, grupoId: null, asesorId: null });
      else expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Área fuera de tu alcance' });
    });
  });

  test.each([['ASESOR', ASESOR], ['AGENTE_SVC', AGENTE], ['un rol desconocido', OTRO_ROL]])('%s ve lo suyo aunque pida otra cosa', async (_n, user) => {
    for (const q of ['asesor_id=8', 'asesor_id=20', 'grupo_id=2', 'area_id=2', 'asesor_id=8&grupo_id=1&area_id=1', '']) {
      reportes.dashboardArea.mockClear();
      expect((await pedir(user, `dashboard?${q}`)).status).toBe(200);
      expect(alcance().asesorId).toBe(7);
    }
  });

  test.each(['grupo_id=1', 'area_id=1', 'grupo_id=13&area_id=1', 'grupo_id=99'])('JEFE_PAP sigue en el grupo PAP (%s)', async (q) => {
    expect((await pedir(JEFE_PAP, `dashboard?${q}`)).status).toBe(200);
    expect(alcance()).toEqual({ areaId: 3, grupoId: 3, asesorId: null });
  });

  test.each(['asesor_id=8&grupo_id=2', 'asesor_id=20&grupo_id=1', 'grupo_id=1&area_id=2', 'asesor_id=8&area_id=2'])('basta que uno de los pedidos esté fuera del alcance (%s)', async (q) => {
    expect((await pedir(ADMIN, `dashboard?${q}`)).status).toBe(403);
    expect(reportes.dashboardArea).not.toHaveBeenCalled();
  });

  test('los tres a la vez, si todos están a su alcance', async () => {
    expect((await pedir(ADMIN, 'dashboard?asesor_id=9&grupo_id=11&area_id=1')).status).toBe(200);
    expect(alcance()).toEqual({ areaId: 1, grupoId: 11, asesorId: 9 });
  });
});
