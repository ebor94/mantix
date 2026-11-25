const { DataTypes } = require('sequelize');
const v = require('../src/sv/validations/config.validation');

// Ejecuta la factory del modelo con un sequelize falso, sin abrir conexión a la base.
function atributosDe(factory) {
  let attrs = null;
  factory({ define: (_nombre, a) => { attrs = a; return {}; } }, DataTypes);
  return attrs;
}

describe('modelos', () => {
  test('SvProducto tiene tipo y marca de "por definir"', () => {
    const a = atributosDe(require('../src/sv/models/Producto'));
    expect(a.prod_tipo.type.key).toBe('STRING');
    expect(a.prod_tipo.type.options.length).toBe(50);
    expect(a.prod_tipo.allowNull).not.toBe(false);
    expect(a.prod_es_generico.type.key).toBe('TINYINT');
    expect(a.prod_es_generico.defaultValue).toBe(0);
  });

  test('SvProspectoProducto tiene el precio ofrecido, opcional', () => {
    const a = atributosDe(require('../src/sv/models/ProspectoProducto'));
    expect(a.pp_precio_ofrecido.type.key).toBe('DECIMAL');
    expect(a.pp_precio_ofrecido.allowNull).not.toBe(false);
  });
});

describe('validación del catálogo de productos', () => {
  const BASE = { prod_area_id: 1, prod_codigo: 'PRE-X', prod_nombre: 'X' };

  test('crear: sin tipo y sin marca nace como producto normal', () => {
    const { error, value } = v.producto.create.validate(BASE);
    expect(error).toBeUndefined();
    expect(value.prod_es_generico).toBe(0);
  });

  test('crear: acepta tipo y marca', () => {
    const { error, value } = v.producto.create.validate({ ...BASE, prod_tipo: 'Osarios', prod_es_generico: 1 });
    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({ prod_tipo: 'Osarios', prod_es_generico: 1 }));
  });

  test.each([[{ prod_tipo: 'a'.repeat(51) }], [{ prod_es_generico: 2 }]])('rechaza %j al crear y al editar', (extra) => {
    expect(v.producto.create.validate({ ...BASE, ...extra }).error).toBeDefined();
    expect(v.producto.update.validate(extra).error).toBeDefined();
  });

  test.each([[{ prod_tipo: '' }], [{ prod_tipo: null }], [{ prod_tipo: 'Lotes' }], [{ prod_es_generico: 0 }]])('editar acepta %j', (cambio) => {
    expect(v.producto.update.validate(cambio).error).toBeUndefined();
  });
});
