const mockPool     = { findAll: jest.fn(), findByPk: jest.fn(), update: jest.fn() };
const mockEvento   = { findByPk: jest.fn() };
const mockAsis     = { findOne: jest.fn() };
const mockPersona  = { create: jest.fn() };
const mockProsp    = { create: jest.fn() };
const mockFuente   = { findOne: jest.fn() };
const mockEstado   = { findOne: jest.fn() };
const mockUsr      = { findByPk: jest.fn() };
const mockPersonasSvc = { buscarPorTelefono: jest.fn() };

jest.mock('../src/sv/models', () => ({
  SvEventoPoolRegistro: mockPool,
  SvEventoAgenda:       mockEvento,
  SvEventoAsistente:    mockAsis,
  SvPersona:            mockPersona,
  SvProspecto:          mockProsp,
  SvFuente:             mockFuente,
  SvEstado:             mockEstado,
  SvUsuario:            mockUsr
}));
jest.mock('../src/sv/services/personas.service', () => mockPersonasSvc);
jest.mock('../src/sv/utils/telefono', () => ({
  normalizar: (t) => String(t || '').replace(/\D/g, ''),
  esValido:   () => true
}));

jest.mock('../src/sv/services/eventosAgenda.service', () => ({
  validarAccesoEvento: undefined // no exportada; se skippea en este test
}));

const svc = require('../src/sv/services/eventoPool.service');

const jefe = { usr_id: 20, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };

beforeEach(() => jest.clearAllMocks());

describe('listar', () => {
  test('sin filtro devuelve todos', async () => {
    mockEvento.findByPk.mockResolvedValue({ evento_id: 500 });
    mockPool.findAll.mockResolvedValue([{ pool_id: 1 }, { pool_id: 2 }]);
    const r = await svc.listar(500, {}, jefe);
    expect(r).toHaveLength(2);
    expect(mockPool.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { pool_evento_id: 500 }
    }));
  });

  test('asignado=false filtra pool_prosp_id IS NULL', async () => {
    mockEvento.findByPk.mockResolvedValue({ evento_id: 500 });
    mockPool.findAll.mockResolvedValue([]);
    await svc.listar(500, { asignado: false }, jefe);
    const w = mockPool.findAll.mock.calls[0][0].where;
    expect(w.pool_prosp_id).toBeNull();
  });
});

describe('asignar', () => {
  test('happy path: crea persona + prospecto + actualiza pool', async () => {
    mockEvento.findByPk.mockResolvedValue({
      evento_id: 500, evento_area_id: 4, evento_grupo_id: 3
    });
    mockPool.findByPk.mockResolvedValue({
      pool_id: 7, pool_evento_id: 500, pool_nombre: 'Ana', pool_telefono: '3001111', pool_correo: null,
      pool_prosp_id: null,
      update: jest.fn().mockResolvedValue(true)
    });
    mockAsis.findOne.mockResolvedValue({ eva_id: 1, eva_usr_id: 15, eva_activo: 1 });
    mockUsr.findByPk.mockResolvedValue({ usr_id: 15, usr_activo: 1 });
    mockFuente.findOne.mockResolvedValue({ fuente_id: 99 });
    mockEstado.findOne.mockResolvedValue({ estado_id: 1 });
    mockPersonasSvc.buscarPorTelefono.mockResolvedValue(null);
    mockPersona.create.mockResolvedValue({ persona_id: 700 });
    mockProsp.create.mockResolvedValue({ prosp_id: 900 });

    const r = await svc.asignar(500, 7, { asesor_id: 15 }, jefe);

    expect(mockPersona.create).toHaveBeenCalled();
    expect(mockProsp.create).toHaveBeenCalledWith(expect.objectContaining({
      prosp_asesor_id: 15, prosp_fuente_id: 99, prosp_area_id: 4, prosp_grupo_id: 3
    }));
    expect(r.pool.update).toHaveBeenCalledWith(expect.objectContaining({
      pool_prosp_id: 900, pool_asignado_a: 15, pool_asignado_por: 20
    }));
    expect(r.prospecto.prosp_id).toBe(900);
  });

  test('rechaza si el pool ya fue asignado', async () => {
    mockEvento.findByPk.mockResolvedValue({ evento_id: 500 });
    mockPool.findByPk.mockResolvedValue({ pool_id: 7, pool_prosp_id: 900 });
    await expect(svc.asignar(500, 7, { asesor_id: 15 }, jefe))
      .rejects.toMatchObject({ code: 'YA_ASIGNADO' });
  });

  test('rechaza si el asesor destino no es asistente activo', async () => {
    mockEvento.findByPk.mockResolvedValue({ evento_id: 500 });
    mockPool.findByPk.mockResolvedValue({ pool_id: 7, pool_prosp_id: null, pool_evento_id: 500 });
    mockAsis.findOne.mockResolvedValue(null); // no es asistente
    await expect(svc.asignar(500, 7, { asesor_id: 999 }, jefe))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
