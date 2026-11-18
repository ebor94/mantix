jest.mock('../src/sv/models', () => {
  const t = { commit: jest.fn(), rollback: jest.fn() };
  return {
    sequelize: { transaction: jest.fn(async () => t) },
    SvGestion: {
      create: jest.fn(async (d) => ({ gest_id: 1, ...d })),
      findByPk: jest.fn(async () => ({ gest_id: 1, dataValues: {} }))
    },
    SvProspecto: { update: jest.fn(), findByPk: jest.fn(async () => ({ prosp_id: 9 })) },
    SvResultado: {},
    SvEstado: { findByPk: jest.fn(async () => null) },
    SvUsuario: {}
  };
});
jest.mock('../src/sv/services/recuperacionAuto.service', () => ({ intentarRecuperacion: jest.fn(async () => null) }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { SvGestion } = require('../src/sv/models');
const gestiones = require('../src/sv/services/gestiones.service');

beforeEach(() => jest.clearAllMocks());

test('guarda gest_homenaje_sala_id cuando viene', async () => {
  await gestiones.crear({ gest_prosp_id: 9, gest_canal: 'visita_sala', gest_homenaje_sala_id: 55 }, 7);
  expect(SvGestion.create.mock.calls[0][0]).toEqual(expect.objectContaining({
    gest_prosp_id: 9, gest_canal: 'visita_sala', gest_homenaje_sala_id: 55, gest_asesor_id: 7
  }));
});

test('deja gest_homenaje_sala_id en null cuando no viene', async () => {
  await gestiones.crear({ gest_prosp_id: 9 }, 7);
  expect(SvGestion.create.mock.calls[0][0].gest_homenaje_sala_id).toBeNull();
});
