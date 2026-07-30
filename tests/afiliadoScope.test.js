/**
 * Task 1.2 — scope de asesor en getAllAfiliados / getAfiliadoByDocumento /
 * getTrazabilidad.
 *
 * Verifica que estos tres caminos, antes sin ningún filtro, ahora aplican
 * whereConFiltroAsesor cuando se les pasa un usuario, y que preservan el
 * comportamiento previo (sin filtro) cuando no se pasa usuario — que es el
 * caso de la consulta pública/OTP, que reusa getAfiliadoByDocumento sin tocar
 * su firma.
 *
 * Se mockea la capa de modelos (mismo patrón que tests/convenioService.test.js)
 * para no necesitar base de datos.
 */

const mockAfiliado = {
  findAll: jest.fn(),
  findOne: jest.fn()
};
const mockTrazabilidad = { findAll: jest.fn() };

jest.mock('../src/models', () => ({
  sequelize: {},
  Afiliado: mockAfiliado,
  Beneficiario: {},
  Empresa: {},
  Convenio: {},
  Seguro: {},
  ContratoValor: {},
  Tarifa: {},
  Trazabilidad: mockTrazabilidad,
  Usuario: {}
}));

const afiliadoService = require('../src/services/afiliado.service');

const asesorPlano   = { id: 7, es_super_admin: false, rol: { permisos: { afiliaciones: {} } } };
const asesorVerTodas = { id: 8, es_super_admin: false, rol: { permisos: { afiliaciones: { ver_todas: true } } } };
const superAdmin    = { id: 1, es_super_admin: true };

beforeEach(() => {
  mockAfiliado.findAll.mockReset().mockResolvedValue([]);
  mockAfiliado.findOne.mockReset().mockResolvedValue(null);
  mockTrazabilidad.findAll.mockReset().mockResolvedValue([]);
});

describe('getAllAfiliados', () => {
  test('sin usuario no aplica filtro (compatibilidad hacia atrás)', async () => {
    await afiliadoService.getAllAfiliados();
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({});
  });

  test('asesor sin ver_todas: filtra por asesorId', async () => {
    await afiliadoService.getAllAfiliados(asesorPlano);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({ asesorId: 7 });
  });

  test('asesor con permiso ver_todas: sin filtro', async () => {
    await afiliadoService.getAllAfiliados(asesorVerTodas);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({});
  });

  test('super_admin: sin filtro', async () => {
    await afiliadoService.getAllAfiliados(superAdmin);
    const { where } = mockAfiliado.findAll.mock.calls[0][0];
    expect(where).toEqual({});
  });
});

describe('getAfiliadoByDocumento', () => {
  test('sin usuario (consulta pública/OTP) no aplica filtro de asesor', async () => {
    await afiliadoService.getAfiliadoByDocumento('123');
    const { where } = mockAfiliado.findOne.mock.calls[0][0];
    expect(where).toEqual({ numeroDocumento: '123' });
  });

  test('con usuario asesor sin ver_todas: agrega asesorId al where', async () => {
    await afiliadoService.getAfiliadoByDocumento('123', asesorPlano);
    const { where } = mockAfiliado.findOne.mock.calls[0][0];
    expect(where).toEqual({ numeroDocumento: '123', asesorId: 7 });
  });

  test('con super_admin: sin filtro adicional', async () => {
    await afiliadoService.getAfiliadoByDocumento('123', superAdmin);
    const { where } = mockAfiliado.findOne.mock.calls[0][0];
    expect(where).toEqual({ numeroDocumento: '123' });
  });
});

describe('getTrazabilidad', () => {
  test('sin usuario no valida ownership (compatibilidad hacia atrás)', async () => {
    const result = await afiliadoService.getTrazabilidad(55);
    expect(mockAfiliado.findOne).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  test('con usuario: si el afiliado no pasa whereConFiltroAsesor, retorna null', async () => {
    mockAfiliado.findOne.mockResolvedValue(null); // no visible para este asesor
    const result = await afiliadoService.getTrazabilidad(55, asesorPlano);

    expect(mockAfiliado.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, asesorId: 7 } })
    );
    expect(result).toBeNull();
    expect(mockTrazabilidad.findAll).not.toHaveBeenCalled();
  });

  test('con usuario: si el afiliado sí pasa el filtro, retorna los registros', async () => {
    mockAfiliado.findOne.mockResolvedValue({ id: 55 });
    mockTrazabilidad.findAll.mockResolvedValue([{ id: 1, tipo: 'CONSULTA' }]);

    const result = await afiliadoService.getTrazabilidad(55, asesorPlano);

    expect(result).toEqual([{ id: 1, tipo: 'CONSULTA' }]);
  });

  test('super_admin: no restringe por asesorId al validar ownership', async () => {
    mockAfiliado.findOne.mockResolvedValue({ id: 55 });
    await afiliadoService.getTrazabilidad(55, superAdmin);

    expect(mockAfiliado.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 } })
    );
  });
});
