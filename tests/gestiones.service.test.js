/**
 * gestiones.service.crear: la gestión queda a nombre de quien la registra.
 * Modelos, transacción y recuperación automática simulados (sin base).
 */
jest.mock('../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/sv/services/recuperacionAuto.service', () => ({ intentarRecuperacion: jest.fn() }));
jest.mock('../src/sv/models', () => {
  const t = { commit: jest.fn(), rollback: jest.fn() };
  return {
    sequelize:   { transaction: jest.fn(async () => t) },
    SvGestion:   { create: jest.fn(), findByPk: jest.fn() },
    SvProspecto: { findByPk: jest.fn(), update: jest.fn() },
    SvEstado:    { findByPk: jest.fn() },
    SvResultado: {},
    SvUsuario:   {}
  };
});

const { SvGestion } = require('../src/sv/models');
const { crear } = require('../src/sv/services/gestiones.service');

beforeEach(() => {
  jest.clearAllMocks();
  SvGestion.create.mockResolvedValue({ gest_id: 1 });
  SvGestion.findByPk.mockResolvedValue({ gest_id: 1, dataValues: {} });
});

describe('gestiones.service.crear', () => {
  test('ignora gest_asesor_id del payload: queda a nombre de quien registra', async () => {
    await crear({ gest_prosp_id: 5, gest_asesor_id: 99, gest_canal: 'llamada' }, 7);
    expect(SvGestion.create).toHaveBeenCalledTimes(1);
    expect(SvGestion.create.mock.calls[0][0].gest_asesor_id).toBe(7);
  });

  test('sin gest_asesor_id en el payload usa el asesorId recibido', async () => {
    await crear({ gest_prosp_id: 5 }, 7);
    expect(SvGestion.create.mock.calls[0][0].gest_asesor_id).toBe(7);
  });
});
