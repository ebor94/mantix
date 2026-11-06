jest.mock('../../models', () => ({
  EmpresaNomina: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    findOrCreate: jest.fn()
  }
}));

const { Op } = require('sequelize');
const { EmpresaNomina } = require('../../models');
const svc = require('../empresaNomina.service');

beforeEach(() => jest.resetAllMocks());

describe('importarNomina', () => {
  test('reimportar es idempotente: existentes cuentan como actualizados y se usa updateOnDuplicate', async () => {
    EmpresaNomina.findAll.mockResolvedValue([{ numeroDocumento: '111' }]);
    EmpresaNomina.bulkCreate.mockResolvedValue([]);
    const r = await svc.importarNomina(7, [
      { numeroDocumento: '111', primerNombre: 'Ana' },
      { numeroDocumento: '222', primerNombre: 'Luis' }
    ]);
    expect(r).toEqual({ creados: 1, actualizados: 1, ignorados: 0, errores: [] });
    expect(EmpresaNomina.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { empresaId: 7, numeroDocumento: { [Op.in]: ['111', '222'] } }
    }));
    const [filas, opts] = EmpresaNomina.bulkCreate.mock.calls[0];
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ empresaId: 7, numeroDocumento: '111', activo: 1 });
    expect(opts.updateOnDuplicate).toEqual(expect.arrayContaining(['primerNombre', 'activo']));
  });

  test('documentos repetidos en el mismo archivo se deduplican (gana el último) y cuentan como ignorados', async () => {
    EmpresaNomina.findAll.mockResolvedValue([]);
    EmpresaNomina.bulkCreate.mockResolvedValue([]);
    const r = await svc.importarNomina(7, [
      { numeroDocumento: '111', primerNombre: 'Ana' },
      { numeroDocumento: '111', primerNombre: 'Ana Maria' }
    ]);
    expect(r).toMatchObject({ creados: 1, actualizados: 0, ignorados: 1 });
    const [filas] = EmpresaNomina.bulkCreate.mock.calls[0];
    expect(filas).toHaveLength(1);
    expect(filas[0].primerNombre).toBe('Ana Maria');
  });

  test('filas inválidas van a errores con su número de fila y no se insertan', async () => {
    EmpresaNomina.findAll.mockResolvedValue([]);
    EmpresaNomina.bulkCreate.mockResolvedValue([]);
    const r = await svc.importarNomina(7, [
      { numeroDocumento: '111', primerNombre: 'Ana' },
      { numeroDocumento: '222' },
      { numeroDocumento: '333', primerNombre: 'X', estadoCivil: 'INVALIDO' }
    ]);
    expect(r.creados).toBe(1);
    expect(r.errores.map(e => e.fila)).toEqual([2, 3]);
    expect(r.errores[0].motivo).toMatch(/primerNombre/);
    const [filas] = EmpresaNomina.bulkCreate.mock.calls[0];
    expect(filas.map(f => f.numeroDocumento)).toEqual(['111']);
  });

  test('sin filas válidas no toca la base de datos', async () => {
    const r = await svc.importarNomina(7, [{ primerNombre: 'sin doc' }]);
    expect(r).toMatchObject({ creados: 0, actualizados: 0 });
    expect(r.errores).toHaveLength(1);
    expect(EmpresaNomina.findAll).not.toHaveBeenCalled();
    expect(EmpresaNomina.bulkCreate).not.toHaveBeenCalled();
  });
});

describe('listarNomina', () => {
  test('consulta por empresaId ordenada por apellido y nombre', async () => {
    const filas = [{ numeroDocumento: '1' }];
    EmpresaNomina.findAll.mockResolvedValue(filas);
    const r = await svc.listarNomina(9);
    expect(r).toBe(filas);
    expect(EmpresaNomina.findAll).toHaveBeenCalledWith({
      where: { empresaId: 9 },
      order: [['primerApellido', 'ASC'], ['primerNombre', 'ASC']]
    });
  });
});

describe('crearInteresado', () => {
  test('usa findOrCreate (no sobrescribe) con empresaId, documento recortado y activo=1', async () => {
    const fila = { id: 1 };
    EmpresaNomina.findOrCreate.mockResolvedValue([fila, true]);
    const r = await svc.crearInteresado(5, { numeroDocumento: ' 123 ', primerNombre: 'Eva', celular: '300' });
    expect(r).toBe(fila);
    expect(EmpresaNomina.findOrCreate).toHaveBeenCalledWith({
      where: { empresaId: 5, numeroDocumento: '123' },
      defaults: { empresaId: 5, numeroDocumento: '123', primerNombre: 'Eva', celular: '300', activo: 1 }
    });
  });

  test('un empresaId enviado por el llamador no cambia el where', async () => {
    EmpresaNomina.findOrCreate.mockResolvedValue([{ id: 2 }, false]);
    await svc.crearInteresado(5, { numeroDocumento: '9', empresaId: 99 });
    const arg = EmpresaNomina.findOrCreate.mock.calls[0][0];
    expect(arg.where.empresaId).toBe(5);
    expect(arg.defaults.empresaId).toBe(5);
  });
});
