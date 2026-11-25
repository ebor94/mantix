/** pap.registroRapido: "Volver" guarda la fecha y la hora también en un cliente nuevo. */
jest.mock('../src/sv/services/personas.service', () => ({ crear: jest.fn() }));
jest.mock('../src/sv/models', () => {
  const t = { commit: jest.fn(), rollback: jest.fn() };
  return {
    sequelize:   { transaction: jest.fn(async () => t) },
    SvProspecto: { findOne: jest.fn(), create: jest.fn() },
    SvPersona: {}, SvUsuario: {},
    SvGestion:   { create: jest.fn() },
    SvEstado:    { findOne: jest.fn() },
    SvResultado: { findOne: jest.fn() }
  };
});

const M = require('../src/sv/models');
const personas = require('../src/sv/services/personas.service');
const { registroRapido } = require('../src/sv/services/pap.service');

const base = { nombre: 'Ana', telefono: '3001234567', prox_fecha: '2026-11-30', prox_hora: '10:00' };

beforeEach(() => {
  jest.clearAllMocks();
  M.SvResultado.findOne.mockResolvedValue({ resultado_id: 1, resultado_nombre: 'R' });
  M.SvEstado.findOne.mockResolvedValue({ estado_id: 2, estado_nombre: 'E' });
  personas.crear.mockResolvedValue({ persona_id: 3 });
  M.SvGestion.create.mockResolvedValue({ gest_id: 4 });
  M.SvProspecto.create.mockResolvedValue({ prosp_id: 5 });
});

test('cliente nuevo con VOLVER guarda fecha y hora', async () => {
  M.SvProspecto.findOne.mockResolvedValue(null);
  await registroRapido({ ...base, resultado_codigo: 'VOLVER' }, 7);
  expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining({
    prosp_prox_gestion_fecha: '2026-11-30', prosp_prox_gestion_hora: '10:00'
  }));
});

test('cliente nuevo con otro resultado guarda null', async () => {
  M.SvProspecto.findOne.mockResolvedValue(null);
  await registroRapido({ ...base, resultado_codigo: 'INTERESADO' }, 7);
  expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining({
    prosp_prox_gestion_fecha: null, prosp_prox_gestion_hora: null
  }));
});

test('cliente existente sigue igual: VOLVER guarda y otro resultado limpia', async () => {
  const update = jest.fn();
  M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 5, prosp_zona_pap: null, update });
  await registroRapido({ ...base, resultado_codigo: 'VOLVER' }, 7);
  expect(update.mock.calls[0][0]).toEqual(expect.objectContaining({
    prosp_prox_gestion_fecha: '2026-11-30', prosp_prox_gestion_hora: '10:00'
  }));
  await registroRapido({ ...base, resultado_codigo: 'INTERESADO' }, 7);
  expect(update.mock.calls[1][0]).toEqual(expect.objectContaining({
    prosp_prox_gestion_fecha: null, prosp_prox_gestion_hora: null
  }));
  expect(M.SvProspecto.create).not.toHaveBeenCalled();
});

describe('fecha según resultado_requiere_fecha', () => {
  const res = (extra) => M.SvResultado.findOne.mockResolvedValue({ resultado_id: 1, resultado_nombre: 'R', ...extra });
  const esperada = { prosp_prox_gestion_fecha: '2026-11-30', prosp_prox_gestion_hora: '10:00' };
  const nulas = { prosp_prox_gestion_fecha: null, prosp_prox_gestion_hora: null };

  test('cliente nuevo INTERESADO con requiere fecha guarda en prospecto y gestión', async () => {
    res({ resultado_requiere_fecha: 1 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    await registroRapido({ ...base, resultado_codigo: 'INTERESADO' }, 7);
    expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining(esperada));
    expect(M.SvGestion.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      gest_prox_fecha: '2026-11-30', gest_prox_hora: '10:00'
    }));
  });

  test('cliente existente INTERESADO con requiere fecha guarda en update', async () => {
    res({ resultado_requiere_fecha: 1 });
    const update = jest.fn();
    M.SvProspecto.findOne.mockResolvedValue({ prosp_id: 5, prosp_zona_pap: null, update });
    await registroRapido({ ...base, resultado_codigo: 'INTERESADO' }, 7);
    expect(update.mock.calls[0][0]).toEqual(expect.objectContaining(esperada));
  });

  test('INTERESADO sin requiere fecha guarda nulas', async () => {
    res({ resultado_requiere_fecha: 0 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    await registroRapido({ ...base, resultado_codigo: 'INTERESADO' }, 7);
    expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining(nulas));
    expect(M.SvGestion.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      gest_prox_fecha: null, gest_prox_hora: null
    }));
  });

  test('VOLVER con requiere fecha 0 o ausente guarda la fecha', async () => {
    for (const extra of [{ resultado_requiere_fecha: 0 }, {}]) {
      jest.clearAllMocks();
      res(extra);
      M.SvProspecto.findOne.mockResolvedValue(null);
      M.SvProspecto.create.mockResolvedValue({ prosp_id: 5 });
      M.SvGestion.create.mockResolvedValue({ gest_id: 4 });
      await registroRapido({ ...base, resultado_codigo: 'VOLVER' }, 7);
      expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining(esperada));
      expect(M.SvGestion.create.mock.calls[0][0]).toEqual(expect.objectContaining({
        gest_prox_fecha: '2026-11-30', gest_prox_hora: '10:00'
      }));
    }
  });

  test('NO_INTERESADO con 0 guarda nulas aunque llegue prox_fecha', async () => {
    res({ resultado_requiere_fecha: 0 });
    M.SvProspecto.findOne.mockResolvedValue(null);
    await registroRapido({ ...base, resultado_codigo: 'NO_INTERESADO' }, 7);
    expect(M.SvProspecto.create.mock.calls[0][0]).toEqual(expect.objectContaining(nulas));
    expect(M.SvGestion.create.mock.calls[0][0]).toEqual(expect.objectContaining({
      gest_prox_fecha: null, gest_prox_hora: null
    }));
  });
});
