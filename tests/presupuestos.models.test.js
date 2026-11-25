const { DataTypes } = require('sequelize');
const v = require('../src/sv/validations/presupuestos.validation');

function definir(factory) {
  let r = null;
  factory({ define: (nombre, attrs, opts) => { r = { nombre, attrs, opts }; return {}; } }, DataTypes);
  return r;
}

describe('modelo del presupuesto', () => {
  const { nombre, attrs, opts } = definir(require('../src/sv/models/Presupuesto'));

  test('tabla y marcas de tiempo', () => {
    expect(nombre).toBe('SvPresupuesto');
    expect(opts.tableName).toBe('sv_org_presupuestos');
    expect(opts.createdAt).toBe('pre_created_at');
    expect(opts.updatedAt).toBe('pre_updated_at');
  });

  test('columnas y tipos', () => {
    expect(Object.keys(attrs)).toEqual([
      'pre_id', 'pre_usr_id', 'pre_area_id', 'pre_anio', 'pre_mes', 'pre_categoria',
      'pre_valor', 'pre_created_by', 'pre_updated_by'
    ]);
    expect(attrs.pre_anio.type.key).toBe('SMALLINT');
    expect(attrs.pre_mes.type.key).toBe('TINYINT');
    expect(attrs.pre_categoria.type.toString()).toBe('VARCHAR(50)');
    expect(attrs.pre_valor.type.toString()).toBe('DECIMAL(14,2)');
    expect(attrs.pre_valor.defaultValue).toBe(0);
    for (const k of Object.keys(attrs).filter((n) => n !== 'pre_id')) expect(attrs[k].allowNull).toBe(false);
  });

  test('es única por asesor, área, año, mes y categoría, y solo por ellas', () => {
    const unicas = Object.keys(attrs).filter((k) => attrs[k].unique === 'uq_presupuesto');
    expect(unicas).toEqual(['pre_usr_id', 'pre_area_id', 'pre_anio', 'pre_mes', 'pre_categoria']);
  });
});

describe('validación de la consulta', () => {
  const valor = (q) => v.consultar.validate(q, { abortEarly: false, stripUnknown: true });

  test('acepta números y texto numérico', () => {
    expect(valor({ area_id: '1', anio: '2026', mes: '11', otro: 'x' }).value).toEqual({ area_id: 1, anio: 2026, mes: 11 });
  });

  test.each([
    ['mes 0', { area_id: 1, anio: 2026, mes: 0 }],
    ['mes 13', { area_id: 1, anio: 2026, mes: 13 }],
    ['año 2024', { area_id: 1, anio: 2024, mes: 1 }],
    ['año 2100', { area_id: 1, anio: 2100, mes: 1 }],
    ['área decimal', { area_id: 1.5, anio: 2026, mes: 1 }],
    ['área texto', { area_id: 'a', anio: 2026, mes: 1 }],
    ['sin área', { anio: 2026, mes: 1 }]
  ])('rechaza %s', (_n, q) => {
    expect(valor(q).error).toBeDefined();
  });
});
