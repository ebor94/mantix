/** gestiones.crear + venta: todo en la misma transacción. */
jest.mock('../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/sv/services/recuperacionAuto.service', () => ({ intentarRecuperacion: jest.fn() }));
jest.mock('../src/sv/services/ventas.service', () => ({ registrarAlCerrar: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  sequelize: { transaction: jest.fn() },
  SvGestion: { create: jest.fn(), findByPk: jest.fn() },
  SvProspecto: { findByPk: jest.fn(), update: jest.fn() },
  SvEstado: { findByPk: jest.fn() },
  SvResultado: {}, SvUsuario: {}
}));

const M = require('../src/sv/models');
const ventas = require('../src/sv/services/ventas.service');
const { crear } = require('../src/sv/services/gestiones.service');

const t = { commit: jest.fn(), rollback: jest.fn() };
const VENTA = { clave: 'abcdefgh-1', items: [{ prod_id: 10, cantidad: 1, precio_unitario: 5 }] };
const PROSPECTO = { prosp_id: 9, prosp_area_id: 1 };

beforeEach(() => {
  jest.resetAllMocks();
  M.sequelize.transaction.mockResolvedValue(t);
  M.SvGestion.create.mockResolvedValue({ gest_id: 77 });
  M.SvGestion.findByPk.mockResolvedValue({ gest_id: 77, dataValues: {} });
  M.SvProspecto.findByPk.mockResolvedValue(PROSPECTO);
  M.SvEstado.findByPk.mockResolvedValue({ estado_id: 5, estado_es_final: 1, estado_es_ganado: 1 });
});

test('al cerrar el contrato registra la venta con la gestión, en la misma transacción', async () => {
  await crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5, venta: VENTA }, 7);
  expect(ventas.registrarAlCerrar).toHaveBeenCalledWith({
    prospecto: PROSPECTO, gestId: 77, estadoNuevo: expect.objectContaining({ estado_es_ganado: 1 }),
    venta: VENTA, usuarioId: 7, transaction: t
  });
  expect(t.commit).toHaveBeenCalledTimes(1);
});

test('lee el cliente dentro de la transacción', async () => {
  await crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5, venta: VENTA }, 7);
  expect(M.SvProspecto.findByPk).toHaveBeenCalled();
  for (const llamada of M.SvProspecto.findByPk.mock.calls) {
    expect(llamada).toEqual([9, { transaction: t }]);
    expect(llamada[1].transaction).toBe(t);
  }
});

test('cerrar sin venta también pasa por la regla', async () => {
  await crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5 }, 7);
  expect(ventas.registrarAlCerrar.mock.calls[0][0].venta).toBeNull();
});

test('si la venta no es válida se revierte todo', async () => {
  ventas.registrarAlCerrar.mockRejectedValue(Object.assign(new Error('mal'), { code: 'VALIDATION_ERROR' }));
  await expect(crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5, venta: VENTA }, 7)).rejects.toThrow('mal');
  expect(t.rollback).toHaveBeenCalledTimes(1);
  expect(t.commit).not.toHaveBeenCalled();
});

test('si falla la lectura posterior al commit se propaga ese error, sin intentar revertir', async () => {
  const lectura = new Error('se cayó la conexión');
  M.SvGestion.findByPk.mockRejectedValue(lectura);
  // Así responde Sequelize: ya no hay nada que revertir.
  t.rollback.mockRejectedValue(new Error('Transaction cannot be rolled back because it has been finished with state: commit'));
  await expect(crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5, venta: VENTA }, 7)).rejects.toBe(lectura);
  expect(t.commit).toHaveBeenCalledTimes(1);
  expect(t.rollback).not.toHaveBeenCalled();
});

test('devuelve la gestión guardada y avisa si se generó una recuperación', async () => {
  const recuperacion = require('../src/sv/services/recuperacionAuto.service');
  recuperacion.intentarRecuperacion.mockResolvedValue({ prosp_id: 950 });
  const g = await crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 5, venta: VENTA }, 7);
  expect(M.SvGestion.findByPk.mock.calls[0][0]).toBe(77);
  expect(M.SvGestion.findByPk.mock.invocationCallOrder[0]).toBeGreaterThan(t.commit.mock.invocationCallOrder[0]);
  expect(g.gest_id).toBe(77);
  expect(g.dataValues.recuperacion_svc.prosp_id).toBe(950);
});

test('una venta sin cambio de estado pasa por la regla, que la rechaza', async () => {
  await crear({ gest_prosp_id: 9, venta: VENTA }, 7);
  expect(ventas.registrarAlCerrar.mock.calls[0][0].estadoNuevo).toBeNull();
});

test('las demás gestiones no la llaman', async () => {
  M.SvEstado.findByPk.mockResolvedValue({ estado_id: 2, estado_es_final: 0, estado_es_ganado: 0 });
  await crear({ gest_prosp_id: 9, gest_estado_nuevo_id: 2 }, 7);
  await crear({ gest_prosp_id: 9 }, 7);
  expect(ventas.registrarAlCerrar).not.toHaveBeenCalled();
});
