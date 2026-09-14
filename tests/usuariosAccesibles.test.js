const mockUsuario = { findAll: jest.fn() };
jest.mock('../src/sv/models', () => ({ SvUsuario: mockUsuario }));

const { usuariosAccesibles } = require('../src/sv/utils/acceso');

const asesor      = { usr_id: 10, rol: { rol_codigo: 'ASESOR' } };
const agenteSvc   = { usr_id: 11, rol: { rol_codigo: 'AGENTE_SVC' } };
const superAdmin  = { usr_id: 12, rol: { rol_codigo: 'SUPER_ADMIN' } };
const superviso   = {
  usr_id: 20, rol: { rol_codigo: 'SUPERVISOR' },
  usr_grupo_id: 3, gruposExtra: [{ grupo_id: 4 }]
};
const coordinador = {
  usr_id: 21, rol: { rol_codigo: 'COORDINADOR_PREVISION' },
  usr_grupo_id: 5, gruposExtra: []
};
const director    = {
  usr_id: 30, rol: { rol_codigo: 'DIRECTOR_COMERCIAL' },
  usr_area_id: 2, areasExtra: [{ area_id: 3 }, { area_id: 4 }]
};

beforeEach(() => mockUsuario.findAll.mockReset().mockResolvedValue([]));

describe('usuariosAccesibles', () => {
  test('SUPER_ADMIN → null (sin filtro)', async () => {
    const r = await usuariosAccesibles(superAdmin);
    expect(r).toBeNull();
  });

  test('ASESOR → [self]', async () => {
    const r = await usuariosAccesibles(asesor);
    expect(r).toEqual([10]);
  });

  test('AGENTE_SVC → [self]', async () => {
    const r = await usuariosAccesibles(agenteSvc);
    expect(r).toEqual([11]);
  });

  test('SUPERVISOR → usr_ids de todos los grupos accesibles', async () => {
    mockUsuario.findAll.mockResolvedValue([{ usr_id: 100 }, { usr_id: 101 }, { usr_id: 102 }]);
    const r = await usuariosAccesibles(superviso);
    expect(r).toEqual([100, 101, 102]);
    // Verificar que consultó por grupos [3,4]
    const call = mockUsuario.findAll.mock.calls[0][0];
    expect(call.where.usr_grupo_id).toEqual({ [require('sequelize').Op.in]: [3, 4] });
  });

  test('COORDINADOR_PREVISION → usr_ids de su grupo', async () => {
    mockUsuario.findAll.mockResolvedValue([{ usr_id: 200 }, { usr_id: 201 }]);
    const r = await usuariosAccesibles(coordinador);
    expect(r).toEqual([200, 201]);
    const call = mockUsuario.findAll.mock.calls[0][0];
    expect(call.where.usr_grupo_id).toEqual({ [require('sequelize').Op.in]: [5] });
  });

  test('DIRECTOR_COMERCIAL → usr_ids de todas las áreas accesibles', async () => {
    mockUsuario.findAll.mockResolvedValue([{ usr_id: 300 }, { usr_id: 301 }]);
    const r = await usuariosAccesibles(director);
    expect(r).toEqual([300, 301]);
    const call = mockUsuario.findAll.mock.calls[0][0];
    expect(call.where.usr_area_id).toEqual({ [require('sequelize').Op.in]: [2, 3, 4] });
  });

  test('rol desconocido → [self] (safe default)', async () => {
    const r = await usuariosAccesibles({ usr_id: 999, rol: { rol_codigo: 'NEW_ROLE' } });
    expect(r).toEqual([999]);
  });
});
