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
    expect(attrs.venta_clave.type.toString()).toBe('VARCHAR(40)');
    expect(attrs.venta_clave.unique).toBe('uq_venta_clave');
    expect(attrs.venta_fecha.type.key).toBe('DATEONLY');
    expect(attrs.venta_anulada.defaultValue).toBe(0);
    for (const k of ['venta_prosp_id', 'venta_gest_id', 'venta_clave', 'venta_asesor_id', 'venta_area_id', 'venta_fecha', 'venta_total', 'venta_created_by']) {
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
  const CLAVE = 'abcdefgh-1';
  const valor = (schema, body) => schema.validate(body, { abortEarly: false, stripUnknown: true });

  test('acepta productos con cantidad y precio, y descarta un total enviado', () => {
    const { error, value } = valor(v.venta, { clave: CLAVE, items: [{ ...ITEM, total: 1, vi_precio_ofrecido: 1 }], total: 5 });
    expect(error).toBeUndefined();
    expect(value).toEqual({ clave: CLAVE, items: [ITEM] });
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
    const { error } = valor(v.venta, { clave: CLAVE, items });
    expect(error).toBeDefined();
    expect(error.details.every((d) => d.path[0] === 'items')).toBe(true);
  });

  test.each([
    ['ausente', undefined], ['vacía', ''], ['de 7 caracteres', 'abcdefg'], ['de 7 y espacios', '  abcdefg  '],
    ['de 41 caracteres', 'a'.repeat(41)], ['que no es texto', 12345678]
  ])('rechaza una clave %s', (_n, clave) => {
    const { error } = valor(v.venta, { clave, items: [ITEM] });
    expect(error.details.map((d) => d.path.join('.'))).toEqual(['clave']);
  });

  test.each([['de 8 caracteres', 'abcdefg1'], ['de 40 caracteres', 'a'.repeat(40)], ['uuid', '0b0f7c1e-6f0a-4b7e-9a53-0d6f3b1a2c4d']])('acepta una clave %s', (_n, clave) => {
    expect(valor(v.venta, { clave, items: [ITEM] }).error).toBeUndefined();
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
    const venta = { clave: CLAVE, items: [ITEM] };
    expect(valor(crm.gestiones.create, g).error).toBeUndefined();
    expect(valor(crm.gestiones.create, { ...g, venta }).value.venta).toEqual(venta);
    expect(valor(crm.gestiones.create, { ...g, venta: { ...venta, items: [] } }).error).toBeDefined();
    expect(valor(crm.gestiones.create, { ...g, venta: { items: [ITEM] } }).error).toBeDefined();
    expect(valor(salas.visita, { gest_resultado_id: 3, venta }).value.venta).toEqual(venta);
    expect(valor(salas.visita, { gest_resultado_id: 3, venta: { items: [ITEM] } }).error).toBeDefined();
    expect(valor(salas.visita, { gest_resultado_id: 3 }).error).toBeUndefined();
  });
});
