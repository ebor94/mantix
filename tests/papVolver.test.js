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
