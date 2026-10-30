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
      usuario: 'jperez', nombre: 'Juan', rol: 'guarda', sede_id: 3, sede_nombre: 'Norte', exp: expect.any(Number),
    });
  });

  test('ida y vuelta sin sede', () => {
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG);
    expect(verificarToken(token, CONFIG.jwtSecret)).toEqual({
      usuario: 'ana', nombre: 'Ana', rol: 'admin_porteria', sede_id: null, sede_nombre: null, exp: expect.any(Number),
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

  test('firmarToken con exp explícito conserva ese exp', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG, { exp });
    expect(verificarToken(token, CONFIG.jwtSecret).exp).toBe(exp);
  });

  test('token sin exp → 401', () => {
    const token = jwt.sign({ scope: 'porteria', rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('token sin sub → 401', () => {
    const token = jwt.sign({ scope: 'porteria', rol: 'guarda' }, CONFIG.jwtSecret, { expiresIn: '1h' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('token HS512 con el mismo secreto → 401', () => {
    const token = jwt.sign({ scope: 'porteria', rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x', expiresIn: '1h', algorithm: 'HS512' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('token alg none → 401', () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ scope: 'porteria', rol: 'guarda', sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
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
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: 2, sede_nombre: 'Sur', exp: 99 }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: { id: 2, nombre: 'Sur' } });
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: null, sede_nombre: null }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: null });
});
