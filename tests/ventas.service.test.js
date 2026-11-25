jest.mock('../src/sv/models', () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
  SvVenta: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  SvVentaItem: { bulkCreate: jest.fn(), findAll: jest.fn(), destroy: jest.fn() },
  SvVentaCambio: { create: jest.fn(), count: jest.fn() },
  SvProducto: { findOne: jest.fn(), findAll: jest.fn() },
  SvProspectoProducto: { findAll: jest.fn() },
  SvUsuario: {}
}));
jest.mock('../src/sv/utils/fechas', () => ({ ...jest.requireActual('../src/sv/utils/fechas'), hoyBogotaISO: () => '2026-11-24' }));

const { Op } = require('sequelize');
const M = require('../src/sv/models');
const ventas = require('../src/sv/services/ventas.service');

const t = { commit: jest.fn(), rollback: jest.fn() };
const PRODUCTOS = [
  { prod_id: 10, prod_nombre: 'Osario A2', prod_activo: 1, prod_es_generico: 0, prod_precio_base: '8770000.00' },
  { prod_id: 11, prod_nombre: 'Columbario', prod_activo: 1, prod_es_generico: 0, prod_precio_base: '4785000.00' },
  { prod_id: 12, prod_nombre: 'Nivel 1A', prod_activo: 1, prod_es_generico: 0, prod_precio_base: '0.00' },
  { prod_id: 13, prod_nombre: 'Osarios', prod_activo: 1, prod_es_generico: 1, prod_precio_base: null },
  { prod_id: 14, prod_nombre: 'Velación', prod_activo: 0, prod_es_generico: 0, prod_precio_base: '1.00' }
];
const PROSPECTO = { prosp_id: 900, prosp_area_id: 1, prosp_asesor_id: 7 };
const GANADO = { estado_id: 5, estado_es_ganado: 1 };
const CLAVE = 'abcdefgh-1';
const ITEMS = [{ prod_id: 10, cantidad: 2, precio_unitario: 8500000 }, { prod_id: 11, cantidad: 1, precio_unitario: 4785000 }];

beforeEach(() => {
  jest.resetAllMocks();
  M.sequelize.transaction.mockResolvedValue(t);
  M.SvProducto.findOne.mockResolvedValue({ prod_id: 10 });
  M.SvProducto.findAll.mockImplementation(async ({ where }) =>
    PRODUCTOS.filter((p) => where.prod_id[Op.in].includes(p.prod_id) && where.prod_area_id === 1));
  M.SvProspectoProducto.findAll.mockResolvedValue([]);
  M.SvVenta.create.mockResolvedValue({ venta_id: 40 });
  M.SvVentaCambio.count.mockResolvedValue(0);
});
const error = (p) => p.then(() => null, (e) => e);
const filas = () => M.SvVentaItem.bulkCreate.mock.calls[0][0];

describe('registrarAlCerrar', () => {
  const cerrar = (extra = {}) => ventas.registrarAlCerrar({
    prospecto: PROSPECTO, gestId: 77, estadoNuevo: GANADO, venta: { clave: CLAVE, items: ITEMS }, usuarioId: 7, transaction: t, ...extra
  });

  test('guarda la venta del dueño con el total calculado y la fecha de Colombia', async () => {
    await cerrar();
    expect(M.SvVenta.create).toHaveBeenCalledWith({
      venta_prosp_id: 900, venta_gest_id: 77, venta_clave: 'abcdefgh-1', venta_asesor_id: 7, venta_area_id: 1,
      venta_fecha: '2026-11-24', venta_total: 21785000, venta_created_by: 7
    }, { transaction: t });
    expect(M.SvVentaItem.bulkCreate.mock.calls[0][1]).toEqual({ transaction: t });
  });

  test('si la registra el supervisor, suma al dueño del cliente', async () => {
    await cerrar({ usuarioId: 3 });
    expect(M.SvVenta.create.mock.calls[0][0]).toEqual(expect.objectContaining({ venta_asesor_id: 7, venta_created_by: 3 }));
  });

  test('un cliente sin asesor suma a quien la registra', async () => {
    await cerrar({ prospecto: { ...PROSPECTO, prosp_asesor_id: null }, usuarioId: 3 });
    expect(M.SvVenta.create.mock.calls[0][0].venta_asesor_id).toBe(3);
  });

  test('el precio ofrecido sale del interés; si no hay, del catálogo; sin precio queda null', async () => {
    M.SvProspectoProducto.findAll.mockResolvedValue([{ pp_prod_id: 10, pp_precio_ofrecido: '8000000.00' }]);
    await cerrar({ venta: { clave: CLAVE, items: [...ITEMS, { prod_id: 12, cantidad: 1, precio_unitario: 900000, vi_precio_ofrecido: 5 }] } });
    expect(filas()).toEqual([
      { vi_venta_id: 40, vi_prod_id: 10, vi_cantidad: 2, vi_precio_ofrecido: '8000000.00', vi_precio_unitario: 8500000 },
      { vi_venta_id: 40, vi_prod_id: 11, vi_cantidad: 1, vi_precio_ofrecido: '4785000.00', vi_precio_unitario: 4785000 },
      { vi_venta_id: 40, vi_prod_id: 12, vi_cantidad: 1, vi_precio_ofrecido: null, vi_precio_unitario: 900000 }
    ]);
    expect(M.SvProspectoProducto.findAll.mock.calls[0][0].where.pp_prosp_id).toBe(900);
  });

  test.each([
    ['sin venta', null, /productos vendidos/],
    ['sin productos', { clave: CLAVE, items: [] }, /al menos un producto/],
    ['con un "por definir"', { clave: CLAVE, items: [{ prod_id: 13, cantidad: 1, precio_unitario: 1 }] }, /"Osarios" está por definir/],
    ['con un producto inactivo', { clave: CLAVE, items: [{ prod_id: 14, cantidad: 1, precio_unitario: 1 }] }, /ya no está disponible/],
    ['con un producto de otra área', { clave: CLAVE, items: [{ prod_id: 99, cantidad: 1, precio_unitario: 1 }] }, /ya no está disponible/],
    ['con un producto repetido', { clave: CLAVE, items: [ITEMS[0], ITEMS[0]] }, /dos veces/],
    ['con un total imposible', { clave: CLAVE, items: [{ prod_id: 10, cantidad: 999, precio_unitario: 9999999999 }] }, /demasiado alto/]
  ])('cerrar %s → VALIDATION_ERROR y no guarda nada', async (_n, venta, mensaje) => {
    const e = await error(cerrar({ venta }));
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toMatch(mensaje);
    expect(M.SvVenta.create).not.toHaveBeenCalled();
  });

  test('pregunta por el catálogo del área dentro de la transacción', async () => {
    await cerrar();
    expect(M.SvProducto.findOne.mock.calls[0][0].transaction).toBe(t);
  });

  test('en un área sin catálogo por tipos no pide venta', async () => {
    M.SvProducto.findOne.mockResolvedValue(null);
    expect(await cerrar({ venta: null })).toBeNull();
    expect(M.SvVenta.create).not.toHaveBeenCalled();
    expect(M.SvProducto.findOne.mock.calls[0][0].where).toEqual({ prod_area_id: 1, prod_activo: 1, prod_tipo: { [Op.ne]: '' } });
  });

  test('una venta sin cerrar el contrato se rechaza', async () => {
    expect((await error(cerrar({ estadoNuevo: { estado_es_ganado: 0 } }))).message).toMatch(/solo se registra al cerrar/);
    expect((await error(cerrar({ estadoNuevo: null }))).code).toBe('VALIDATION_ERROR');
    M.SvProducto.findOne.mockResolvedValue(null);
    expect((await error(cerrar())).code).toBe('VALIDATION_ERROR');
  });

  test('si la clave ya se usó → CONFLICT y no guarda productos', async () => {
    const choque = Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
    M.SvVenta.create.mockRejectedValue(choque);
    const e = await error(cerrar());
    expect(e.code).toBe('CONFLICT');
    expect(e.message).toBe('Esta venta ya quedó registrada. Recarga la ficha para verla');
    expect(M.SvVentaItem.bulkCreate).not.toHaveBeenCalled();
  });

  test('cualquier otro error al guardar la venta se propaga igual', async () => {
    const otro = new Error('db caída');
    M.SvVenta.create.mockRejectedValue(otro);
    expect(await error(cerrar())).toBe(otro);
    expect(otro.code).toBeUndefined();
  });

  test('un choque en los productos no se confunde con la clave', async () => {
    const choque = Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' });
    M.SvVentaItem.bulkCreate.mockRejectedValue(choque);
    expect(await error(cerrar())).toBe(choque);
    expect(choque.code).toBeUndefined();
  });
});

describe('yaRegistrada', () => {
  test.each([['existe una venta con esa clave', true, { venta_id: 40 }], ['no existe', false, null]])('%s → %s', async (_n, esperado, fila) => {
    M.SvVenta.findOne.mockResolvedValue(fila);
    expect(await ventas.yaRegistrada(CLAVE)).toBe(esperado);
    expect(M.SvVenta.findOne.mock.calls[0][0].where).toEqual({ venta_clave: 'abcdefgh-1' });
  });

  test('el error es el mismo de registrarAlCerrar', async () => {
    M.SvVenta.create.mockRejectedValue(Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError' }));
    const alCerrar = await error(ventas.registrarAlCerrar({
      prospecto: PROSPECTO, gestId: 77, estadoNuevo: GANADO, venta: { clave: CLAVE, items: ITEMS }, usuarioId: 7, transaction: t
    }));
    const e = ventas.errorYaRegistrada();
    expect([e.code, e.message]).toEqual([alCerrar.code, alCerrar.message]);
    expect(e.code).toBe('CONFLICT');
  });
});

describe('listarDeProspecto y obtener', () => {
  const alias = (o) => o.include.map((i) => i.as);
  const orden = () => [
    [{ model: M.SvVentaItem, as: 'items' }, 'vi_id', 'ASC'],
    [{ model: M.SvVentaCambio, as: 'cambios' }, 'vc_id', 'DESC']
  ];

  test('la lista va de la venta más reciente a la más antigua, con su detalle en orden', async () => {
    M.SvVenta.findAll.mockResolvedValue([{ venta_id: 40 }]);
    expect(await ventas.listarDeProspecto(900)).toEqual([{ venta_id: 40 }]);
    const o = M.SvVenta.findAll.mock.calls[0][0];
    expect(o.where).toEqual({ venta_prosp_id: 900 });
    expect(alias(o)).toEqual(['items', 'asesor', 'cambios']);
    expect(o.order).toEqual([['venta_fecha', 'DESC'], ['venta_id', 'DESC'], ...orden()]);
  });

  test('una venta trae el mismo detalle, en el mismo orden', async () => {
    M.SvVenta.findByPk.mockResolvedValue({ venta_id: 40 });
    expect(await ventas.obtener(40)).toEqual({ venta_id: 40 });
    const [id, o] = M.SvVenta.findByPk.mock.calls[0];
    expect(id).toBe(40);
    expect(alias(o)).toEqual(['items', 'asesor', 'cambios']);
    expect(o.order).toEqual(orden());
  });
});

describe('corregir y anular', () => {
  const fila = (prod, cantidad, precio, ofrecido = null) => ({ vi_prod_id: prod, vi_cantidad: cantidad, vi_precio_unitario: precio, vi_precio_ofrecido: ofrecido });
  let venta;
  beforeEach(() => {
    venta = { venta_id: 40, venta_prosp_id: 900, venta_area_id: 1, venta_total: '21785000.00', venta_anulada: 0, update: jest.fn() };
    M.SvVenta.findByPk.mockResolvedValue(venta);
    M.SvVentaItem.findAll.mockResolvedValue([fila(10, 2, '8500000.00', '8000000.00'), fila(11, 1, '4785000.00')]);
  });
  const NUEVOS = [{ prod_id: 10, cantidad: 1, precio_unitario: 8500000 }];
  const corregir = (extra = {}) => ventas.corregir(40, { items: NUEVOS, motivo: 'eran uno', cambios_vistos: 0, ...extra }, 3);

  test('reemplaza los productos, guarda el cambio y el total, todo en la transacción', async () => {
    await corregir();
    expect(M.SvVentaItem.destroy).toHaveBeenCalledWith({ where: { vi_venta_id: 40 }, transaction: t });
    expect(filas()).toEqual([{ vi_venta_id: 40, vi_prod_id: 10, vi_cantidad: 1, vi_precio_ofrecido: '8000000.00', vi_precio_unitario: 8500000 }]);
    expect(M.SvVentaCambio.create).toHaveBeenCalledWith({
      vc_venta_id: 40, vc_usr_id: 3, vc_accion: 'corregir', vc_motivo: 'eran uno',
      vc_total_antes: '21785000.00', vc_total_despues: 8500000,
      vc_detalle: {
        antes: [
          { prod_id: 10, cantidad: 2, precio_unitario: 8500000, precio_ofrecido: 8000000 },
          { prod_id: 11, cantidad: 1, precio_unitario: 4785000, precio_ofrecido: null }
        ],
        despues: [{ prod_id: 10, cantidad: 1, precio_unitario: 8500000, precio_ofrecido: 8000000 }]
      }
    }, { transaction: t });
    expect(venta.update).toHaveBeenCalledWith({ venta_total: 8500000 }, { transaction: t });
    expect(M.SvVenta.findByPk.mock.calls[0]).toEqual([40, { transaction: t, lock: true }]);
    expect(t.commit).toHaveBeenCalledTimes(1);
  });

  test('el historial guarda null cuando no hubo precio ofrecido, no 0', async () => {
    M.SvVentaItem.findAll.mockResolvedValue([fila(12, 1, '900000.00', null)]);
    await corregir({ items: [{ prod_id: 12, cantidad: 2, precio_unitario: 900000 }] });
    expect(M.SvVentaCambio.create.mock.calls[0][0].vc_detalle).toEqual({
      antes: [{ prod_id: 12, cantidad: 1, precio_unitario: 900000, precio_ofrecido: null }],
      despues: [{ prod_id: 12, cantidad: 2, precio_unitario: 900000, precio_ofrecido: null }]
    });
  });

  test('conserva un producto vendido que después desactivaron, pero no deja agregarlo', async () => {
    M.SvVentaItem.findAll.mockResolvedValue([fila(14, 1, '100.00')]);
    await corregir({ items: [{ prod_id: 14, cantidad: 2, precio_unitario: 100 }] });
    expect(filas()[0].vi_prod_id).toBe(14);
    M.SvVentaItem.findAll.mockResolvedValue([fila(10, 1, '100.00')]);
    expect((await error(corregir({ items: [{ prod_id: 14, cantidad: 1, precio_unitario: 100 }] }))).message).toMatch(/ya no está disponible/);
  });

  test.each([
    ['solo el precio', [{ prod_id: 10, cantidad: 2, precio_unitario: 8400000 }, { prod_id: 11, cantidad: 1, precio_unitario: 4785000 }], 21585000],
    ['solo quitando un producto', [{ prod_id: 10, cantidad: 2, precio_unitario: 8500000 }], 17000000]
  ])('corregir %s guarda', async (_n, items, total) => {
    await corregir({ items });
    expect(filas().map((f) => ({ prod_id: f.vi_prod_id, cantidad: f.vi_cantidad, precio_unitario: f.vi_precio_unitario }))).toEqual(items);
    expect(M.SvVentaCambio.create).toHaveBeenCalledTimes(1);
    expect(venta.update).toHaveBeenCalledWith({ venta_total: total }, { transaction: t });
    expect(t.commit).toHaveBeenCalledTimes(1);
  });

  test('todo lo que lee y escribe va en la transacción', async () => {
    await corregir();
    expect(M.SvVentaCambio.count).toHaveBeenCalledWith({ where: { vc_venta_id: 40 }, transaction: t });
    expect(M.SvVentaItem.findAll).toHaveBeenCalledWith({ where: { vi_venta_id: 40 }, transaction: t });
    expect(M.SvVentaItem.bulkCreate.mock.calls[0][1]).toEqual({ transaction: t });
    for (const m of [M.SvProducto.findAll, M.SvProspectoProducto.findAll]) {
      expect(m).toHaveBeenCalledTimes(1);
      expect(m.mock.calls[0][0].transaction).toBe(t);
    }
  });

  test('un producto agregado toma el precio ofrecido del interés o, si no hay, el del catálogo', async () => {
    M.SvVentaItem.findAll.mockResolvedValue([fila(12, 1, '900000.00', '850000.00')]);
    // El interés en el 12 cambió después: el que ya estaba en la venta conserva el suyo.
    M.SvProspectoProducto.findAll.mockResolvedValue([{ pp_prod_id: 10, pp_precio_ofrecido: '8000000.00' }, { pp_prod_id: 12, pp_precio_ofrecido: '1.00' }]);
    await corregir({ items: [{ prod_id: 12, cantidad: 1, precio_unitario: 900000 }, ...ITEMS] });
    expect(filas().map((f) => [f.vi_prod_id, f.vi_precio_ofrecido])).toEqual([[12, '850000.00'], [10, '8000000.00'], [11, '4785000.00']]);
    expect(M.SvProspectoProducto.findAll.mock.calls[0][0].where.pp_prosp_id).toBe(900);
  });

  test('los productos se validan contra el área de la venta', async () => {
    venta.venta_area_id = 2;
    M.SvProducto.findAll.mockImplementation(async ({ where }) =>
      (where.prod_area_id === 2 ? [{ ...PRODUCTOS[0], prod_id: 20 }] : PRODUCTOS).filter((p) => where.prod_id[Op.in].includes(p.prod_id)));
    expect((await error(corregir())).message).toMatch(/ya no está disponible/);
    await corregir({ items: [{ prod_id: 20, cantidad: 1, precio_unitario: 100 }] });
    expect(filas()[0].vi_prod_id).toBe(20);
  });

  test('sin cambios no guarda nada', async () => {
    const e = await error(corregir({ items: [{ prod_id: 11, cantidad: 1, precio_unitario: 4785000 }, { prod_id: 10, cantidad: 2, precio_unitario: 8500000 }] }));
    expect(e.message).toBe('No hay cambios para guardar');
    expect(M.SvVentaItem.destroy).not.toHaveBeenCalled();
    expect(t.rollback).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['inexistente', () => M.SvVenta.findByPk.mockResolvedValue(null), 'NOT_FOUND'],
    ['anulada', () => { venta.venta_anulada = 1; }, 'CONFLICT'],
    ['cambiada por otra persona', () => M.SvVentaCambio.count.mockResolvedValue(1), 'CONFLICT']
  ])('venta %s: ni corrige ni anula', async (_n, preparar, code) => {
    preparar();
    expect((await error(corregir())).code).toBe(code);
    expect((await error(ventas.anular(40, { motivo: 'se cayó', cambios_vistos: 0 }, 3))).code).toBe(code);
    expect(M.SvVentaCambio.create).not.toHaveBeenCalled();
    expect(venta.update).not.toHaveBeenCalled();
  });

  test('anular la marca y deja el motivo, el total y los productos que tenía', async () => {
    await ventas.anular(40, { motivo: 'el cliente desistió', cambios_vistos: 0 }, 3);
    expect(M.SvVentaCambio.create).toHaveBeenCalledWith({
      vc_venta_id: 40, vc_usr_id: 3, vc_accion: 'anular', vc_motivo: 'el cliente desistió', vc_total_antes: '21785000.00', vc_total_despues: 0,
      vc_detalle: {
        antes: [
          { prod_id: 10, cantidad: 2, precio_unitario: 8500000, precio_ofrecido: 8000000 },
          { prod_id: 11, cantidad: 1, precio_unitario: 4785000, precio_ofrecido: null }
        ],
        despues: []
      }
    }, { transaction: t });
    expect(M.SvVentaItem.findAll).toHaveBeenCalledWith({ where: { vi_venta_id: 40 }, transaction: t });
    expect(venta.update).toHaveBeenCalledWith({ venta_anulada: 1 }, { transaction: t });
    expect(M.SvVentaItem.destroy).not.toHaveBeenCalled();
  });

  test('si algo falla revierte y propaga el error original', async () => {
    M.SvVentaCambio.create.mockRejectedValue(new Error('db caída'));
    t.rollback.mockRejectedValue(new Error('rollback'));
    await expect(corregir()).rejects.toThrow('db caída');
    expect(t.commit).not.toHaveBeenCalled();
  });
});

describe('metricasPorAsesor', () => {
  test('devuelve números por asesor y consulta el rango completo', async () => {
    M.sequelize.query.mockResolvedValue([{ asesor: 7, contratos: '2', valor: '9770000.00' }]);
    const r = await ventas.metricasPorAsesor([7, 8], '2026-11-01', '2026-11-30');
    expect(r.get(7)).toEqual({ contratos: 2, valor: 9770000 });
    expect(r.has(8)).toBe(false);
    expect(M.sequelize.query.mock.calls[0][1].replacements).toEqual({
      ids: [7, 8], desde: '2026-11-01', hasta: '2026-11-30', inicio: '2026-11-01 00:00:00', fin: '2026-11-30 23:59:59'
    });
  });

  test('no cuenta las ventas anuladas ni, como cierre sin venta, la gestión que ya la tiene', async () => {
    M.sequelize.query.mockResolvedValue([]);
    await ventas.metricasPorAsesor([7], '2026-11-01', '2026-11-30');
    const sql = M.sequelize.query.mock.calls[0][0];
    expect(sql).toContain('venta_anulada = 0');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM sv_crm_ventas v WHERE v.venta_gest_id = g.gest_id)');
  });

  test('sin asesores no consulta', async () => {
    expect((await ventas.metricasPorAsesor([], '2026-11-01', '2026-11-30')).size).toBe(0);
    expect(M.sequelize.query).not.toHaveBeenCalled();
  });
});
