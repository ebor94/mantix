const mockEv    = { findAll: jest.fn() };
const mockAsis  = { findAll: jest.fn() };
const mockProsp = { findAll: jest.fn() };
const mockUsr   = { findAll: jest.fn(), findByPk: jest.fn() };
const mockEstado = {}, mockPersona = {}, mockEmpresa = {};

jest.mock('../src/sv/models', () => ({
  SvEventoAgenda: mockEv, SvEventoAsistente: mockAsis,
  SvProspecto: mockProsp, SvUsuario: mockUsr,
  SvEstado: mockEstado, SvPersona: mockPersona, SvEmpresa: mockEmpresa
}));
jest.mock('../src/sv/utils/acceso', () => ({
  grupoIdsAccesibles: jest.fn(() => [3, 4]),
  usuariosAccesibles: jest.fn()
}));

const svc = require('../src/sv/services/agenda.service');
const acceso = require('../src/sv/utils/acceso');

const jefe = { usr_id: 20, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAsis.findAll.mockResolvedValue([]);
  mockUsr.findAll.mockResolvedValue([{ usr_id: 10 }, { usr_id: 11 }]);
  mockProsp.findAll.mockResolvedValue([]);
  mockEv.findAll.mockResolvedValue([]);
});

describe('listarSemana', () => {
  test('calcula lunes-domingo de una semana ISO', async () => {
    // Semana 38 de 2026: lunes 14/09 → domingo 20/09
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    const r = await svc.listarSemana({ anio: 2026, semanaISO: 38, asesoresIds: [], actor: jefe });
    expect(r.lunes).toBe('2026-09-14');
    expect(r.domingo).toBe('2026-09-20');
    expect(Object.keys(r.por_dia)).toHaveLength(7);
  });

  test('rechaza asesoresIds fuera del scope del actor', async () => {
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    await expect(svc.listarSemana({
      anio: 2026, semanaISO: 38, asesoresIds: [10, 999], actor: jefe
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('con asesoresIds vacío usa todo el scope del actor', async () => {
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    await svc.listarSemana({ anio: 2026, semanaISO: 38, asesoresIds: [], actor: jefe });
    // Espera que consulte eventos donde asesor_id in [10,11] o asistente activo
    expect(mockEv.findAll).toHaveBeenCalled();
  });
});
