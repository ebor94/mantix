jest.mock('../src/sv/models', () => ({
  sequelize: { transaction: jest.fn() },
  SvProspecto: { create: jest.fn(), findByPk: jest.fn() },
  SvProspectoProducto: { create: jest.fn(), findAll: jest.fn(), destroy: jest.fn() },
  SvProducto: { findAll: jest.fn() },
  SvPersona: {}, SvUsuario: {}, SvEstado: {}, SvFuente: {}, SvPunto: {},
  SvLista: {}, SvGestion: {}, SvResultado: {}, SvEmpresa: {}
}));

const { Op } = require('sequelize');
const M = require('../src/sv/models');
const prospectos = require('../src/sv/services/prospectos.service');

const t = { commit: jest.fn(), rollback: jest.fn() };
const PRECIOS = { 10: '8770000.00', 11: '5315000.00', 12: null, 13: '4000000.00', 14: '0.00' };
const GENERICOS = new Set([13]); // "por definir" con precio escrito

beforeEach(() => {
  jest.resetAllMocks();
  M.sequelize.transaction.mockResolvedValue(t);
  M.SvProspecto.create.mockResolvedValue({ prosp_id: 900 });
  M.SvProspecto.findByPk.mockResolvedValue({ prosp_id: 900 });
  M.SvProspectoProducto.findAll.mockResolvedValue([]);
  M.SvProducto.findAll.mockImplementation(async ({ where }) =>
    where.prod_id[Op.in].filter((id) => id in PRECIOS).map((id) => ({ prod_id: id, prod_precio_base: PRECIOS[id], prod_es_generico: GENERICOS.has(id) ? 1 : 0 })));
});

const creados = () => M.SvProspectoProducto.create.mock.calls.map(([d]) => d);

describe('crear', () => {
  const BASE = { prosp_area_id: 1, prosp_grupo_id: 1, prosp_persona_id: 5, prosp_estado_id: 1 };

  test('guarda el precio vigente de cada producto', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 10, es_principal: true, nota: 'n' }, { prod_id: 11 }] }, 7);
    expect(creados()).toEqual([
      { pp_prosp_id: 900, pp_prod_id: 10, pp_es_principal: 1, pp_nota: 'n', pp_precio_ofrecido: '8770000.00' },
      { pp_prosp_id: 900, pp_prod_id: 11, pp_es_principal: 0, pp_nota: null, pp_precio_ofrecido: '5315000.00' }
    ]);
    expect(M.SvProducto.findAll.mock.calls[0][0]).toEqual(expect.objectContaining({ transaction: t }));
    expect(t.commit).toHaveBeenCalledTimes(1);
  });

  test('sin precio (por definir o sin lista) guarda null', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 12 }] }, 7);
    expect(creados()[0].pp_precio_ofrecido).toBeNull();
  });

  test('un "por definir" con precio escrito guarda null', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 13 }] }, 7);
    expect(creados()[0].pp_precio_ofrecido).toBeNull();
  });

  test('un producto con precio 0.00 guarda null', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 14 }] }, 7);
    expect(creados()[0].pp_precio_ofrecido).toBeNull();
  });

  test('ignora un precio enviado por el cliente', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 10, pp_precio_ofrecido: 1, precio: 1, prod_precio_base: 1 }] }, 7);
    expect(creados()[0].pp_precio_ofrecido).toBe('8770000.00');
  });

  test('ignora repetidos y los que no traen prod_id', async () => {
    await prospectos.crear({ ...BASE, productos: [{ prod_id: 10, es_principal: true }, { prod_id: '10' }, { es_principal: false }] }, 7);
    expect(creados()).toHaveLength(1);
    expect(creados()[0]).toEqual(expect.objectContaining({ pp_prod_id: 10, pp_es_principal: 1 }));
  });

  test('sin productos no consulta precios', async () => {
    await prospectos.crear({ ...BASE }, 7);
    expect(M.SvProducto.findAll).not.toHaveBeenCalled();
    expect(M.SvProspectoProducto.create).not.toHaveBeenCalled();
  });
});

describe('actualizarProductos', () => {
  const fila = (pp_id, pp_prod_id, pp_precio_ofrecido) => ({ pp_id, pp_prod_id, pp_precio_ofrecido, update: jest.fn(async () => {}) });

  test('conserva el precio ofrecido de los que siguen: solo cambia principal y nota', async () => {
    const a = fila(1, 10, '5000000.00');
    M.SvProspectoProducto.findAll.mockResolvedValue([a]);
    await prospectos.actualizarProductos(900, [{ prod_id: 10, es_principal: true, nota: 'nueva' }]);
    expect(a.update).toHaveBeenCalledWith({ pp_es_principal: 1, pp_nota: 'nueva' }, { transaction: t });
    expect(M.SvProspectoProducto.create).not.toHaveBeenCalled();
    expect(M.SvProspectoProducto.destroy).not.toHaveBeenCalled();
    expect(M.SvProducto.findAll).not.toHaveBeenCalled();
  });

  test('el que se agrega toma el precio de hoy y el que se quita se borra', async () => {
    const a = fila(1, 10, '5000000.00');
    const b = fila(2, 12, null);
    M.SvProspectoProducto.findAll.mockResolvedValue([a, b]);
    await prospectos.actualizarProductos(900, [{ prod_id: 10 }, { prod_id: 11, es_principal: true }]);
    expect(M.SvProspectoProducto.destroy).toHaveBeenCalledWith({ where: { pp_id: { [Op.in]: [2] } }, transaction: t });
    expect(creados()).toEqual([{ pp_prosp_id: 900, pp_prod_id: 11, pp_es_principal: 1, pp_nota: null, pp_precio_ofrecido: '5315000.00' }]);
    expect(a.update).toHaveBeenCalledWith({ pp_es_principal: 0, pp_nota: null }, { transaction: t });
    // El precio se consulta solo para el nuevo y dentro de la transacción.
    const consulta = M.SvProducto.findAll.mock.calls[0][0];
    expect(consulta.where.prod_id[Op.in]).toEqual([11]);
    expect(consulta.transaction).toBe(t);
  });

  test('una fila existente pedida como prod_id "10" (texto) se conserva', async () => {
    const a = fila(1, 10, '5000000.00');
    M.SvProspectoProducto.findAll.mockResolvedValue([a]);
    await prospectos.actualizarProductos(900, [{ prod_id: '10' }]);
    expect(M.SvProspectoProducto.destroy).not.toHaveBeenCalled();
    expect(M.SvProspectoProducto.create).not.toHaveBeenCalled();
    expect(a.update).toHaveBeenCalledTimes(1);
  });

  test('un pp_precio_ofrecido del cliente en un producto nuevo se ignora', async () => {
    await prospectos.actualizarProductos(900, [{ prod_id: 10, pp_precio_ofrecido: 1 }]);
    expect(creados()[0].pp_precio_ofrecido).toBe('8770000.00');
  });

  test('una lista vacía quita todos los intereses', async () => {
    M.SvProspectoProducto.findAll.mockResolvedValue([fila(1, 10, null), fila(2, 11, null)]);
    await prospectos.actualizarProductos(900, []);
    expect(M.SvProspectoProducto.destroy).toHaveBeenCalledWith({ where: { pp_id: { [Op.in]: [1, 2] } }, transaction: t });
    expect(t.commit).toHaveBeenCalledTimes(1);
  });

  test('lee las filas del prospecto con bloqueo, dentro de la transacción', async () => {
    await prospectos.actualizarProductos(900, [{ prod_id: 10 }]);
    expect(M.SvProspectoProducto.findAll).toHaveBeenCalledWith({ where: { pp_prosp_id: 900 }, transaction: t, lock: true });
  });

  test('dos principales → VALIDATION_ERROR sin abrir transacción', async () => {
    const e = await prospectos.actualizarProductos(900, [{ prod_id: 10, es_principal: true }, { prod_id: 11, es_principal: true }]).catch((x) => x);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('prospecto inexistente → NOT_FOUND', async () => {
    M.SvProspecto.findByPk.mockResolvedValue(null);
    const e = await prospectos.actualizarProductos(999, []).catch((x) => x);
    expect(e.code).toBe('NOT_FOUND');
  });

  test('si algo falla, revierte y propaga el error', async () => {
    M.SvProspectoProducto.create.mockRejectedValue(new Error('db caída'));
    await expect(prospectos.actualizarProductos(900, [{ prod_id: 10 }])).rejects.toThrow('db caída');
    expect(t.rollback).toHaveBeenCalledTimes(1);
    expect(t.commit).not.toHaveBeenCalled();
  });
});
