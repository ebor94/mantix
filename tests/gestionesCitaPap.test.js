/** La cita pendiente se reemplaza completa; quitar_prox (PAP) la borra. */
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
  jest.useFakeTimers().setSystemTime(new Date('2026-11-25T15:00:00Z'));
  SvGestion.create.mockResolvedValue({ gest_id: 1 });
  SvGestion.findByPk.mockResolvedValue({ gest_id: 1, dataValues: {} });
  SvEstado.findByPk.mockResolvedValue({ estado_id: 9, estado_es_final: 0, estado_es_ganado: 0 });
  SvProspecto.findByPk.mockResolvedValue({ prosp_prox_gestion_fecha: '2026-12-10' });
});
afterEach(() => jest.useRealTimers());

const base = { gest_prosp_id: 5 };
const actualizado = () => SvProspecto.update.mock.calls[0]?.[0] ?? {};

test('fecha nueva sin hora: la hora queda en null', async () => {
  await crear({ ...base, gest_prox_fecha: '2026-12-01' }, 7);
  expect(actualizado()).toMatchObject({ prosp_prox_gestion_fecha: '2026-12-01', prosp_prox_gestion_hora: null });
});

test('fecha y hora: ambas', async () => {
  await crear({ ...base, gest_prox_fecha: '2026-12-01', gest_prox_hora: '10:30' }, 7);
  expect(actualizado()).toMatchObject({ prosp_prox_gestion_fecha: '2026-12-01', prosp_prox_gestion_hora: '10:30' });
});

test('solo hora: solo la hora', async () => {
  await crear({ ...base, gest_prox_hora: '10:30' }, 7);
  expect(actualizado()).toEqual({ prosp_prox_gestion_hora: '10:30' });
});

test('sin fecha y sin marca: no toca la cita', async () => {
  await crear({ ...base, gest_comentario: 'x' }, 7);
  expect(SvProspecto.update).not.toHaveBeenCalled();
});

test('quitar_prox: fecha y hora en null', async () => {
  await crear({ ...base, quitar_prox: true }, 7);
  expect(actualizado()).toEqual({ prosp_prox_gestion_fecha: null, prosp_prox_gestion_hora: null });
});

test('quitar_prox con fecha: manda la fecha', async () => {
  await crear({ ...base, quitar_prox: true, gest_prox_fecha: '2026-12-01' }, 7);
  expect(actualizado()).toMatchObject({ prosp_prox_gestion_fecha: '2026-12-01', prosp_prox_gestion_hora: null });
});

test('quitar_prox con estado final y cita futura: queda en null', async () => {
  SvEstado.findByPk.mockResolvedValue({ estado_id: 9, estado_es_final: 1, estado_es_ganado: 0 });
  await crear({ ...base, gest_estado_nuevo_id: 9, quitar_prox: true }, 7);
  expect(actualizado()).toMatchObject({ prosp_prox_gestion_fecha: null, prosp_prox_gestion_hora: null });
});
