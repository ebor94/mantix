/** Contratos y valor vendido salen de ventas.metricasPorAsesor, no del snapshot. */
jest.mock('../src/sv/services/ventas.service', () => ({ metricasPorAsesor: jest.fn(), areaRegistraVentas: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  sequelize: {}, SvArea: {}, SvResultado: {}, SvEstado: {},
  SvSnapshotDiario: { findAll: jest.fn() }, SvUsuario: { findAll: jest.fn() }, SvGrupo: { findByPk: jest.fn() },
  SvGestion: { findAll: jest.fn() }, SvProspecto: { findAll: jest.fn() }, SvMeta: { findOne: jest.fn(), findAll: jest.fn() }
}));
jest.mock('../src/sv/config/db', () => ({ execute: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

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
  M.SvSnapshotDiario.findAll.mockResolvedValue([
    { snap_gestiones_realizadas: 5, snap_interesados_nuevos: 2, snap_contratos_cerrados: 9, snap_valor_vendido_cop: '1.00' }
  ]);
  M.SvUsuario.findAll.mockResolvedValue([{ usr_id: 7, usr_nombre: 'D', usr_apellido: 'M', usr_email: 'd@x' }, { usr_id: 8, usr_nombre: 'E', usr_apellido: 'N', usr_email: 'e@x' }]);
  M.SvGrupo.findByPk.mockResolvedValue({ grupo_area_id: 1 });
  ventas.areaRegistraVentas.mockResolvedValue(true);
  ventas.metricasPorAsesor.mockResolvedValue(new Map([[7, { contratos: 2, valor: 9770000 }]]));
});

test('reporte del asesor: gestiones e interesados del snapshot; contratos y valor al momento', async () => {
  const r = await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.totales).toEqual({ gestiones: 5, interesados: 2, contratos: 2, valor: 9770000 });
  expect(ventas.metricasPorAsesor).toHaveBeenCalledWith([7], '2026-11-01', '2026-11-30');
});

test('sin ventas ni cierres, contratos y valor quedan en 0', async () => {
  ventas.metricasPorAsesor.mockResolvedValue(new Map());
  const r = await reportes.reporteAsesor(7, { desde: '2026-11-01', hasta: '2026-11-30' });
  expect(r.totales).toEqual({ gestiones: 5, interesados: 2, contratos: 0, valor: 0 });
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
