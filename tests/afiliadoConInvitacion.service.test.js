/**
 * Task 4.2 — afiliadoService.createAfiliadoConInvitacion
 * (src/services/afiliado.service.js), consumida por
 * afiliado.controller.createPublicoConvenioInvitacion.
 *
 * Es la variante de createAfiliadoWithBeneficiarios para el registro por
 * invitación de convenio: duplica el bloque transaccional de esa función
 * hermana (en vez de extenderla, para no tocar el camino que usan Veolia y
 * el canal ASESOR) con una sola diferencia real — invitacionService.marcarUsada
 * se llama DENTRO de la misma transacción, antes del commit.
 *
 * Estos tests verifican exactamente esa diferencia:
 *   1. Caso feliz: se crea el afiliado, se consume el token, se hace commit.
 *   2. Doble submit (carrera): marcarUsada lanza AppError 410 porque otro
 *      submit concurrente ya consumió el token — debe hacer ROLLBACK de todo
 *      (afiliado, beneficiarios, etc. incluidos) y propagar el error 410.
 *
 * Se mockea la capa de modelos y los servicios colaboradores (mismo patrón
 * que tests/afiliadoScope.test.js e tests/invitacion.service.test.js) — no
 * se toca base de datos real.
 */

const AppError = require('../src/utils/AppError');

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockSequelize = { transaction: jest.fn(() => Promise.resolve(mockTransaction)) };

const mockAfiliado = {
  create: jest.fn(),
  findByPk: jest.fn()
};
const mockBeneficiario = { bulkCreate: jest.fn() };
const mockSeguro = { bulkCreate: jest.fn() };
const mockContratoValor = { create: jest.fn() };
const mockEmpresa = { create: jest.fn() };

jest.mock('../src/models', () => ({
  sequelize: mockSequelize,
  Afiliado: mockAfiliado,
  Beneficiario: mockBeneficiario,
  Empresa: mockEmpresa,
  Convenio: {},
  Seguro: mockSeguro,
  ContratoValor: mockContratoValor,
  Tarifa: {},
  Trazabilidad: {},
  Usuario: {}
}));

jest.mock('../src/services/empresa.service', () => ({
  buscarPorNit: jest.fn(),
  crearEmpresa: jest.fn()
}));

jest.mock('../src/services/reciboCaja.service', () => ({
  crearReciboParaAfiliacion: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/services/convenio.service', () => ({
  assertReglasConvenio: jest.fn().mockResolvedValue(null)
}));

jest.mock('../src/services/invitacion.service', () => ({
  marcarUsada: jest.fn()
}));

const empresaService = require('../src/services/empresa.service');
const reciboCajaService = require('../src/services/reciboCaja.service');
const convenioService = require('../src/services/convenio.service');
const invitacionService = require('../src/services/invitacion.service');
const afiliadoService = require('../src/services/afiliado.service');

const dataBase = {
  convenioId: 10,
  tipoDocumento: 'CC',
  numeroDocumento: '123456',
  primerNombre: 'Ana',
  primerApellido: 'Pérez',
  celular: '3001234567',
  beneficiarios: [],
  seguros: [],
  contrato: {}
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSequelize.transaction.mockResolvedValue(mockTransaction);
  mockAfiliado.create.mockResolvedValue({ id: 999 });
  mockAfiliado.findByPk.mockResolvedValue({ id: 999, ...dataBase });
  convenioService.assertReglasConvenio.mockResolvedValue(null);
  reciboCajaService.crearReciboParaAfiliacion.mockResolvedValue(null);
});

describe('createAfiliadoConInvitacion — caso feliz', () => {
  test('crea el afiliado, marca la invitación usada DENTRO de la transacción y hace commit', async () => {
    invitacionService.marcarUsada.mockResolvedValue(undefined);

    const result = await afiliadoService.createAfiliadoConInvitacion({ ...dataBase }, 'tok-abc');

    expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    expect(mockAfiliado.create).toHaveBeenCalledTimes(1);

    // marcarUsada se llama con el token, el id del afiliado recién creado y
    // la MISMA transacción — no una nueva ni undefined.
    expect(invitacionService.marcarUsada).toHaveBeenCalledWith('tok-abc', 999, mockTransaction);

    // El orden importa: marcarUsada debe ejecutarse ANTES del commit.
    const ordenMarcarUsada = invitacionService.marcarUsada.mock.invocationCallOrder[0];
    const ordenCommit = mockTransaction.commit.mock.invocationCallOrder[0];
    expect(ordenMarcarUsada).toBeLessThan(ordenCommit);

    expect(mockTransaction.commit).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 999, ...dataBase });
  });
});

describe('createAfiliadoConInvitacion — doble submit concurrente (carrera)', () => {
  test('si marcarUsada lanza AppError 410 (token ya usado), hace ROLLBACK completo y propaga el 410', async () => {
    invitacionService.marcarUsada.mockRejectedValue(
      new AppError('Esta invitación ya fue utilizada', 410)
    );

    await expect(
      afiliadoService.createAfiliadoConInvitacion({ ...dataBase }, 'tok-usado')
    ).rejects.toMatchObject({ statusCode: 410, message: 'Esta invitación ya fue utilizada' });

    // El afiliado (y el resto del bloque: beneficiarios/seguros/contrato/recibo)
    // sí se había creado en memoria de la transacción, pero el rollback deshace
    // TODO — no debe quedar un afiliado huérfano de una invitación no consumida.
    expect(mockAfiliado.create).toHaveBeenCalledTimes(1);
    expect(mockTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(mockTransaction.commit).not.toHaveBeenCalled();

    // findByPk de recarga (paso posterior al commit) nunca debe llamarse:
    // el error se lanza antes de llegar ahí.
    expect(mockAfiliado.findByPk).not.toHaveBeenCalled();
  });
});

describe('createAfiliadoConInvitacion — reglas del convenio', () => {
  test('valida las reglas del convenio ANTES de abrir la transacción (igual que createAfiliadoWithBeneficiarios)', async () => {
    convenioService.assertReglasConvenio.mockRejectedValue(
      new AppError('El grupo familiar no cumple las condiciones del convenio.', 400)
    );

    await expect(
      afiliadoService.createAfiliadoConInvitacion({ ...dataBase }, 'tok-abc')
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockSequelize.transaction).not.toHaveBeenCalled();
    expect(mockAfiliado.create).not.toHaveBeenCalled();
  });
});
