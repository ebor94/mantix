const { DataTypes } = require('sequelize');

// Ejecuta la factory del modelo con un sequelize falso, sin abrir conexión a la base.
function atributosDe(factory) {
  let attrs = null;
  let opts = null;
  const modelo = { beforeUpdate() {}, beforeDestroy() {} };
  const fakeSequelize = { define: (_nombre, a, o) => { attrs = a; opts = o; return modelo; } };
  factory(fakeSequelize, DataTypes);
  return { attrs, opts };
}

describe('modelos de salas de velación', () => {
  test('SvGestion tiene gest_homenaje_sala_id entero y opcional', () => {
    const { attrs } = atributosDe(require('../src/sv/models/Gestion'));
    expect(attrs.gest_homenaje_sala_id).toBeDefined();
    expect(attrs.gest_homenaje_sala_id.type.key).toBe('INTEGER');
    expect(attrs.gest_homenaje_sala_id.allowNull).not.toBe(false);
  });

  test('SvSalaContratante apunta a sv_crm_salas_contratantes', () => {
    const { attrs, opts } = atributosDe(require('../src/sv/models/SalaContratante'));
    expect(opts.tableName).toBe('sv_crm_salas_contratantes');
    expect(attrs.sc_homenaje_sala_id.allowNull).toBe(false);
    expect(attrs.sc_prosp_id.allowNull).toBe(false);
    expect(attrs.sc_usr_id.allowNull).toBe(false);
    expect(opts.createdAt).toBe('sc_created_at');
    expect(opts.updatedAt).toBe(false);
  });
});
