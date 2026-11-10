const jwt = require('jsonwebtoken');
const { ROLES, rolDesdeGrupos, firmarToken, verificarToken, normalizarUsuario, nombresCompatibles } = require('../services/auth.service');

const DN = 'CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local';
const CFG = { jwtSecret: 'm'.repeat(40), jwtExpires: '8h' };
const motivoDe = (fn) => { try { fn(); } catch (e) { return e.motivo; } return 'NO_LANZO'; };

describe('rolDesdeGrupos: DN exacto (spec §9.2)', () => {
  test('DN exacto → admin; sin el grupo → empleado', () => {
    expect(rolDesdeGrupos([DN, 'CN=Otro,OU=Grupos,DC=olivos,DC=local'], DN)).toBe(ROLES.ADMIN);
    expect(rolDesdeGrupos(['CN=Otro,OU=Grupos,DC=olivos,DC=local'], DN)).toBe(ROLES.EMPLEADO);
    expect(rolDesdeGrupos([], DN)).toBe(ROLES.EMPLEADO);
  });

  test('ignora mayúsculas y espacios alrededor de las comas', () => {
    expect(rolDesdeGrupos(['cn=gg-masajes-admin, ou=grupos , dc=olivos,dc=local'], DN)).toBe(ROLES.ADMIN);
  });

  test('mismo CN en otra OU → empleado (no basta el nombre del grupo)', () => {
    expect(rolDesdeGrupos(['CN=GG-Masajes-Admin,OU=Pruebas,DC=olivos,DC=local'], DN)).toBe(ROLES.EMPLEADO);
  });

  test('DN que CONTIENE el nombre del grupo → empleado (el error de detectarRoles en H360)', () => {
    expect(rolDesdeGrupos(['CN=GG-Masajes-Admin-Viejo,OU=Grupos,DC=olivos,DC=local'], DN)).toBe(ROLES.EMPLEADO);
    expect(rolDesdeGrupos([`${DN},OU=Extra`], DN)).toBe(ROLES.EMPLEADO);
  });

  test('falla cerrada: sin DN configurado o memberOf raro, nadie es admin', () => {
    expect(rolDesdeGrupos([DN], '')).toBe(ROLES.EMPLEADO);
    expect(rolDesdeGrupos([DN], undefined)).toBe(ROLES.EMPLEADO);
    expect(rolDesdeGrupos(null, DN)).toBe(ROLES.EMPLEADO);
    expect(rolDesdeGrupos(DN, DN)).toBe(ROLES.EMPLEADO); // un string suelto no es una lista de grupos
  });
});

describe('token propio (scope masajes, HS256)', () => {
  test('ida y vuelta', () => {
    const t = firmarToken({ usuario: 'eortega', nombre: 'Edwin', rol: ROLES.EMPLEADO }, CFG);
    expect(verificarToken(t, CFG.jwtSecret)).toMatchObject({ usuario: 'eortega', nombre: 'Edwin', rol: 'empleado' });
  });

  test('el token no lleva datos personales ni ids internos', () => {
    const p = jwt.decode(firmarToken({ usuario: 'eortega', nombre: 'Edwin', rol: ROLES.EMPLEADO }, CFG));
    expect(Object.keys(p).sort()).toEqual(['exp', 'iat', 'nombre', 'rol', 'scope', 'sub']);
  });

  test.each([
    ['otro secreto (p. ej. el de Portería)', () => jwt.sign({ scope: 'masajes', rol: 'empleado' }, 'p'.repeat(40), { subject: 'x', expiresIn: '1h' })],
    ['scope de Portería', () => jwt.sign({ scope: 'porteria', rol: 'empleado' }, CFG.jwtSecret, { subject: 'x', expiresIn: '1h' })],
    ['sin scope (token del auth principal de Mantix)', () => jwt.sign({ id: 1 }, CFG.jwtSecret, { expiresIn: '1h' })],
    ['rol fuera de la lista', () => jwt.sign({ scope: 'masajes', rol: 'admin' }, CFG.jwtSecret, { subject: 'x', expiresIn: '1h' })],
    ['sin exp', () => jwt.sign({ scope: 'masajes', rol: 'empleado' }, CFG.jwtSecret, { subject: 'x' })],
    ['sin sub', () => jwt.sign({ scope: 'masajes', rol: 'empleado' }, CFG.jwtSecret, { expiresIn: '1h' })],
    ['vencido', () => jwt.sign({ scope: 'masajes', rol: 'empleado', exp: Math.floor(Date.now() / 1000) - 10 }, CFG.jwtSecret, { subject: 'x' })],
    ['alg none', () => jwt.sign({ scope: 'masajes', rol: 'admin_masajes', sub: 'x', exp: Math.floor(Date.now() / 1000) + 3600 }, null, { algorithm: 'none' })],
    ['HS512 con el mismo secreto (algoritmo no permitido)', () => jwt.sign({ scope: 'masajes', rol: 'empleado' }, CFG.jwtSecret, { subject: 'x', expiresIn: '1h', algorithm: 'HS512' })],
    ['basura', () => 'no.es.jwt'],
  ])('%s → NO_AUTENTICADO', (_, crear) => expect(motivoDe(() => verificarToken(crear(), CFG.jwtSecret))).toBe('NO_AUTENTICADO'));
});

describe('normalizarUsuario (misma regla que H360 y Portería)', () => {
  test.each([
    ['EOrtega', 'eortega'], ['OLIVOS\\EOrtega', 'eortega'], ['eortega@olivos.local', 'eortega'], ['  eortega ', 'eortega'],
    [undefined, ''], [null, ''],
  ])('%p → %p', (entrada, salida) => expect(normalizarUsuario(entrada)).toBe(salida));
});

describe('nombresCompatibles (guarda extra de la autovinculación)', () => {
  test('comparten al menos dos palabras del nombre, sin importar tildes ni orden', () => {
    expect(nombresCompatibles('Edwin Ortega', 'Edwin Brandon Ortega Ramirez')).toBe(true);
    expect(nombresCompatibles('ORTEGA RAMÍREZ EDWIN', 'Edwin Brandon Ortega Ramirez')).toBe(true);
  });

  test('una sola palabra en común no basta', () => {
    expect(nombresCompatibles('Edwin Gomez', 'Edwin Brandon Ortega Ramirez')).toBe(false);
  });

  test('las partículas no cuentan como palabras en común', () => {
    expect(nombresCompatibles('Ana de la Cruz', 'Luisa de la Rosa')).toBe(false);
  });

  test('nombre del AD de una sola palabra: debe estar en el del beneficiario', () => {
    expect(nombresCompatibles('Recepción', 'Edwin Ortega')).toBe(false);
    expect(nombresCompatibles('Edwin', 'Edwin')).toBe(true);
  });

  test('vacíos → false', () => {
    expect(nombresCompatibles('', 'Edwin Ortega')).toBe(false);
    expect(nombresCompatibles('Edwin Ortega', null)).toBe(false);
  });
});
