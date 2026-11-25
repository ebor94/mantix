const { DataTypes } = require('sequelize');
const v = require('../src/sv/validations/ventas.validation');
const crm = require('../src/sv/validations/crm.validation');
const salas = require('../src/sv/validations/salas.validation');

function definir(factory) {
  let r = null;
  factory({ define: (nombre, attrs, opts) => { r = { nombre, attrs, opts }; return {}; } }, DataTypes);
  return r;
}

describe('modelos de ventas', () => {
  test('SvVenta', () => {
    const { attrs, opts } = definir(require('../src/sv/models/Venta'));
    expect(opts.tableName).toBe('sv_crm_ventas');
    expect(opts.createdAt).toBe('venta_created_at');
    expect(opts.updatedAt).toBe('venta_updated_at');
    expect(attrs.venta_gest_id.type.key).toBe('BIGINT');
    expect(attrs.venta_fecha.type.key).toBe('DATEONLY');
    expect(attrs.venta_anulada.defaultValue).toBe(0);
    for (const k of ['venta_prosp_id', 'venta_gest_id', 'venta_asesor_id', 'venta_area_id', 'venta_fecha', 'venta_total', 'venta_created_by']) {
      expect(attrs[k].allowNull).toBe(false);
    }
  });

  test('SvVentaItem', () => {
    const { attrs, opts } = definir(require('../src/sv/models/VentaItem'));
    expect(opts.tableName).toBe('sv_crm_ventas_items');
    expect(opts.timestamps).toBe(false);
    expect(Object.keys(attrs)).toEqual(['vi_id', 'vi_venta_id', 'vi_prod_id', 'vi_cantidad', 'vi_precio_ofrecido', 'vi_precio_unitario']);
  });

  test('SvVentaCambio', () => {
    const { attrs, opts } = definir(require('../src/sv/models/VentaCambio'));
    expect(opts.tableName).toBe('sv_crm_ventas_cambios');
    expect(opts.updatedAt).toBe(false);
    expect(attrs.vc_motivo.allowNull).toBe(false);
    expect(attrs.vc_detalle.type.key).toBe('JSON');
  });
});

describe('validación de la venta', () => {
  const ITEM = { prod_id: 1, cantidad: 2, precio_unitario: 8770000 };
  const valor = (schema, body) => schema.validate(body, { abortEarly: false, stripUnknown: true });

  test('acepta productos con cantidad y precio, y descarta un total enviado', () => {
    const { error, value } = valor(v.venta, { items: [{ ...ITEM, total: 1, vi_precio_ofrecido: 1 }], total: 5 });
    expect(error).toBeUndefined();
    expect(value).toEqual({ items: [ITEM] });
  });

  test.each([
    ['sin productos', []],
    ['cantidad 0', [{ ...ITEM, cantidad: 0 }]],
    ['cantidad decimal', [{ ...ITEM, cantidad: 1.5 }]],
    ['precio 0', [{ ...ITEM, precio_unitario: 0 }]],
    ['precio con decimales', [{ ...ITEM, precio_unitario: 10.5 }]],
    ['producto repetido', [ITEM, ITEM]],
    ['sin producto', [{ cantidad: 1, precio_unitario: 1 }]]
  ])('rechaza %s', (_n, items) => {
    expect(valor(v.venta, { items }).error).toBeDefined();
  });

  test('corregir y anular exigen motivo y cuántos cambios se vieron', () => {
    expect(valor(v.corregir, { items: [ITEM], motivo: 'precio mal', cambios_vistos: 0 }).error).toBeUndefined();
    expect(valor(v.corregir, { items: [ITEM], motivo: '   ', cambios_vistos: 0 }).error).toBeDefined();
    expect(valor(v.corregir, { items: [ITEM], motivo: 'precio mal' }).error).toBeDefined();
    expect(valor(v.anular, { motivo: 'se cayó', cambios_vistos: 1 }).error).toBeUndefined();
    expect(valor(v.anular, { cambios_vistos: 1 }).error).toBeDefined();
  });

  test('la gestión y la visita en sala la aceptan, y es opcional', () => {
    const g = { gest_prosp_id: 5 };
    expect(valor(crm.gestiones.create, g).error).toBeUndefined();
    expect(valor(crm.gestiones.create, { ...g, venta: { items: [ITEM] } }).value.venta).toEqual({ items: [ITEM] });
    expect(valor(crm.gestiones.create, { ...g, venta: { items: [] } }).error).toBeDefined();
    expect(valor(salas.visita, { gest_resultado_id: 3, venta: { items: [ITEM] } }).value.venta).toEqual({ items: [ITEM] });
    expect(valor(salas.visita, { gest_resultado_id: 3 }).error).toBeUndefined();
  });
});
