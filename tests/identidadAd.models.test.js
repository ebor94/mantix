const { DataTypes } = require('sequelize');

// Ejecuta la factory del modelo con un sequelize falso y devuelve los atributos,
// sin abrir conexión a la base.
function atributosDe(factory) {
  let attrs = null;
  const fakeSequelize = { define: (_nombre, a) => { attrs = a; return {}; } };
  factory(fakeSequelize, DataTypes);
  return attrs;
}

describe('modelos para login con AD', () => {
  test('OrgIdentidad tiene ad_usuario y password_hash NULL-able', () => {
    const a = atributosDe(require('../src/identity/models/Identidad'));
    expect(a.ad_usuario).toBeDefined();
    expect(a.ad_usuario.type.key).toBe('STRING');
    expect(a.ad_usuario.allowNull).not.toBe(false);
    expect(a.password_hash.allowNull).toBe(true);
  });

  test('SvUsuario tiene usr_id_identidad y usr_password_hash NULL-able', () => {
    const a = atributosDe(require('../src/sv/models/Usuario'));
    expect(a.usr_id_identidad).toBeDefined();
    expect(a.usr_id_identidad.type.key).toBe('INTEGER');
    expect(a.usr_password_hash.allowNull).toBe(true);
  });
});
