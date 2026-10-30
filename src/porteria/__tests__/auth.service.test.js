const jwt = require('jsonwebtoken');
const {
  ROLES, rolDesdeGrupos, firmarToken, verificarToken, usuarioPublico,
} = require('../services/auth.service');

const GRUPOS = { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' };
const dn = (cn) => `CN=${cn},OU=Grupos,DC=olivos,DC=local`;
const CONFIG = { jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef', jwtExpires: '12h' };
/** El error que lanza fn (o undefined si no lanza). */
const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };

describe('rolDesdeGrupos', () => {
  test.each([
    [[dn('PorteriaGuardas')], 'guarda'],
    [[dn('PorteriaAdmins')], 'admin_porteria'],
    [[dn('Admins')], 'admin_porteria'],
    [[dn('PorteriaGuardas'), dn('PorteriaAdmins')], 'admin_porteria'],
    [['cn=porteriaguardas,OU=Grupos,DC=olivos,DC=local'], 'guarda'],
    [[dn('PorteriaGuardasViejos')], null],
    [[dn('OtroGrupo')], null],
    [[], null],
  ])('%p → %p', (memberOf, esperado) => {
    expect(rolDesdeGrupos(memberOf, GRUPOS)).toBe(esperado);
  });

  test('sin LDAP_GROUP_ADMIN configurado no hay admin general', () => {
    expect(rolDesdeGrupos([dn('Admins')], { ...GRUPOS, adminGeneral: null })).toBeNull();
  });
});

describe('tokens', () => {
  test('ida y vuelta con sede', () => {
    const token = firmarToken({ usuario: 'jperez', nombre: 'Juan', rol: ROLES.GUARDA, sede: { id: 3, nombre: 'Norte' } }, CONFIG);
    expect(verificarToken(token, CONFIG.jwtSecret)).toEqual({
      usuario: 'jperez', nombre: 'Juan', rol: 'guarda', sede_id: 3, sede_nombre: 'Norte',
    });
  });

  test('ida y vuelta sin sede', () => {
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG);
    expect(verificarToken(token, CONFIG.jwtSecret)).toEqual({
      usuario: 'ana', nombre: 'Ana', rol: 'admin_porteria', sede_id: null, sede_nombre: null,
    });
  });

  test('otro secreto → 401 NO_AUTENTICADO', () => {
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG);
    expect(errorDe(() => verificarToken(token, 'otro-secreto'))).toMatchObject({
      statusCode: 401, motivo: 'NO_AUTENTICADO', message: 'Sesión inválida o vencida',
    });
  });

  test('token sin scope de portería (p. ej. de otro módulo con el mismo secreto) → 401', () => {
    const token = jwt.sign({ rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('rol desconocido → 401', () => {
    const token = jwt.sign({ scope: 'porteria', rol: 'superusuario' }, CONFIG.jwtSecret, { subject: 'x' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('token vencido → 401', () => {
    const token = jwt.sign(
      { scope: 'porteria', rol: 'guarda', exp: Math.floor(Date.now() / 1000) - 10 }, CONFIG.jwtSecret, { subject: 'x' },
    );
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });
});

test('usuarioPublico arma la sede solo si hay una', () => {
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: 2, sede_nombre: 'Sur' }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: { id: 2, nombre: 'Sur' } });
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: null, sede_nombre: null }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: null });
});
