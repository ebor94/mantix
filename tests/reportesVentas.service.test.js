/** Los reportes se calculan al momento: contratos y valor, con ventas.metricasPorAsesor. */
jest.mock('../src/sv/services/ventas.service', () => ({ metricasPorAsesor: jest.fn(), areaRegistraVentas: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  sequelize: { query: jest.fn() }, SvArea: {}, SvResultado: {}, SvEstado: {},
  SvSnapshotDiario: { findAll: jest.fn() }, SvUsuario: { findAll: jest.fn() }, SvGrupo: { findByPk: jest.fn() },
  SvGestion: { findAll: jest.fn() }, SvProspecto: { findAll: jest.fn() }, SvMeta: { findOne: jest.fn(), findAll: jest.fn() }
}));
jest.mock('../src/sv/config/db', () => ({ execute: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { Op } = require('sequelize');
const M = require('../src/sv/models');
const ventas = require('../src/sv/services/ventas.service');
const reportes = require('../src/sv/services/reportes.service');
const pool = require('../src/sv/config/db');
const { generarSnapshot } = require('../src/sv/services/snapshot.service');

beforeEach(() => {
  jest.resetAllMocks();
  M.SvGestion.findAll.mockResolvedValue([]);
  M.SvProspecto.findAll.mockResolvedValue([]);
  M.SvMeta.findAll.mockResolvedValue([]);
  M.sequelize.query.mockResolvedValue([{ gestiones: 12, interesados: '3' }]);
  M.SvSnapshotDiario.findAll.mockResolvedValue([
    { snap_gestiones_realizadas: 5, snap_interesados_nuevos: 2, snap_contratos_cerrados: 9, snap_valor_vendido_cop: '1.00' }
  ]);
  M.SvUsuario.findAll.mockResolvedValue([{ usr_id: 7, usr_nombre: 'D', usr_apellido: 'M', usr_email: 'd@x' }, { usr_id: 8, usr_nombre: 'E', usr_apellido: 'N', usr_email: 'e@x' }]);
  M.SvGrupo.findByPk.mockResolvedValue({ grupo_area_id: 1 });
  ventas.areaRegistraVentas.mockResolvedValue(true);
  ventas.metricasPorAsesor.mockResolvedValue(new Map([[7, { contratos: 2, valor: 9770000 }]]));
});

test('reporte del asesor: gestiones, interesados, contratos y valor al momento', async () => {
  const r = await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.totales).toEqual({ gestiones: 12, interesados: 3, contratos: 2, valor: 9770000 });
  expect(ventas.metricasPorAsesor).toHaveBeenCalledWith([7], '2026-11-01', '2026-11-30');
});

test('el reporte del asesor sigue devolviendo los snapshots del rango', async () => {
  const r = await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.snaps).toEqual([expect.objectContaining({ snap_gestiones_realizadas: 5, snap_interesados_nuevos: 2 })]);
  expect(M.SvSnapshotDiario.findAll.mock.calls[0][0].where)
    .toEqual({ snap_usuario_id: 7, snap_fecha: { [Op.between]: ['2026-11-01', '2026-11-30'] } });
});

test('las gestiones se cuentan en el rango, del primer al último segundo', async () => {
  await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  await reportes.reporteAsesor(7, { mes: 2, anio: 2028 });
  const rangos = M.sequelize.query.mock.calls.map(([, o]) => [o.replacements.inicio, o.replacements.fin]);
  expect(rangos).toEqual([['2026-11-01 00:00:00', '2026-11-30 23:59:59'], ['2028-02-01 00:00:00', '2028-02-29 23:59:59']]);
  expect(M.sequelize.query.mock.calls[0][0]).toContain('g.gest_fecha_hora BETWEEN :inicio AND :fin');
});

test('solo se cuentan las gestiones del asesor', async () => {
  await reportes.reporteAsesor(8, { desde: '2026-11-01', hasta: '2026-11-30' });
  const [sql, o] = M.sequelize.query.mock.calls[0];
  expect(sql).toContain('g.gest_asesor_id = :usrId');
  expect(o.replacements.usrId).toBe(8);
});

test('interesado es el resultado positivo, y una gestión sin resultado también cuenta', async () => {
  await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  const [sql] = M.sequelize.query.mock.calls[0];
  expect(sql).toContain('r.resultado_es_positivo = 1');
  expect(sql).toMatch(/LEFT JOIN sv_cfg_resultados_gestion r/);
});

test('sin ventas ni cierres, contratos y valor quedan en 0', async () => {
  ventas.metricasPorAsesor.mockResolvedValue(new Map());
  const r = await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.totales).toEqual({ gestiones: 12, interesados: 3, contratos: 0, valor: 0 });
});

test('reporte del equipo: contratos y valor por asesor, y si el área registra ventas', async () => {
  const r = await reportes.reporteEquipo({ grupoId: 1, desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.registra_ventas).toBe(true);
  expect(r.asesores.map((a) => [a.snap_usuario_id, a.snap_contratos_cerrados, a.snap_valor_vendido_cop])).toEqual([[7, 2, 9770000], [8, 0, 0]]);
  expect(ventas.metricasPorAsesor).toHaveBeenCalledWith([7, 8], '2026-11-01', '2026-11-30');
  expect(ventas.areaRegistraVentas).toHaveBeenCalledWith(1);
});

test('un grupo sin asesores también dice si registra ventas', async () => {
  M.SvUsuario.findAll.mockResolvedValue([]);
  ventas.areaRegistraVentas.mockResolvedValue(false);
  expect(await reportes.reporteEquipo({ grupoId: 1, desde: '2026-11-01', hasta: '2026-11-30' }))
    .toEqual({ desde: '2026-11-01', hasta: '2026-11-30', registra_ventas: false, asesores: [] });
});

test.each([['todos', undefined, 6], ['un usuario', 7, 7]])('snapshot de %s: un parámetro por cada marca del SQL', async (_n, usr, n) => {
  pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
  await generarSnapshot('2026-11-20', usr);
  const [sql, params] = pool.execute.mock.calls[0];
  expect(params).toHaveLength(n);
  expect(sql.replace(/--.*$/gm, '').match(/\?/g)).toHaveLength(n);
  expect(params.slice(0, 6)).toEqual(Array(6).fill('2026-11-20'));
  expect(sql).toContain('SUM(v.venta_total)');
});

describe('día del snapshot', () => {
  // 11:55 p. m. del 24 en Colombia; en UTC ya es 25.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-25T04:55:00Z') });
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
  });
  afterEach(() => jest.useRealTimers());

  test('sin fecha es el día que termina en Colombia', async () => {
    const r = await generarSnapshot();
    expect(pool.execute.mock.calls[0][1]).toEqual(Array(6).fill('2026-11-24'));
    expect(r.fecha).toBe('2026-11-24');
  });

  test('con fecha explícita es esa', async () => {
    const r = await generarSnapshot('2026-11-20');
    expect(pool.execute.mock.calls[0][1]).toEqual(Array(6).fill('2026-11-20'));
    expect(r.fecha).toBe('2026-11-20');
  });
});
