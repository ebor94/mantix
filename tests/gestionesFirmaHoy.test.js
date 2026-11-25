/** Al cerrar, la próxima gestión futura pasa al día de firma, que es el día de Colombia. */
jest.mock('../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/sv/services/recuperacionAuto.service', () => ({ intentarRecuperacion: jest.fn() }));
jest.mock('../src/sv/services/ventas.service', () => ({ registrarAlCerrar: jest.fn() }));
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

const { SvGestion, SvProspecto, SvEstado } = require('../src/sv/models');
const { crear } = require('../src/sv/services/gestiones.service');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date('2026-11-26T01:30:00Z')); // 25 de nov, 8:30 p. m. en Colombia
  SvGestion.create.mockResolvedValue({ gest_id: 1 });
  SvGestion.findByPk.mockResolvedValue({ gest_id: 1, dataValues: {} });
  SvEstado.findByPk.mockResolvedValue({ estado_id: 9, estado_es_final: 1, estado_es_ganado: 0 });
  SvProspecto.findByPk.mockResolvedValue({ prosp_prox_gestion_fecha: '2026-11-26' });
});
afterEach(() => jest.useRealTimers());

const base = { gest_prosp_id: 5, gest_estado_nuevo_id: 9 };

test('sin gest_fecha_hora: la próxima del 26 queda en el 25', async () => {
  await crear(base, 7);
  expect(SvProspecto.update).toHaveBeenCalledWith(
    expect.objectContaining({ prosp_prox_gestion_fecha: '2026-11-25', prosp_prox_gestion_hora: null }),
    expect.anything());
});

test('con gest_fecha_hora a las 8:30 p. m. del 25 (UTC del 26) también queda en el 25', async () => {
  await crear({ ...base, gest_fecha_hora: '2026-11-26T01:30:00Z' }, 7);
  expect(SvProspecto.update.mock.calls[0][0].prosp_prox_gestion_fecha).toBe('2026-11-25');
});
