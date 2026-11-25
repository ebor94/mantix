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
const VENTA = { items: [{ prod_id: 10, cantidad: 1, precio_unitario: 5 }] };
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
