// JWT propio del módulo Horno (scope 'horno') y pertenencia al grupo del AD.
const jwt = require('jsonwebtoken');
const HornoError = require('../utils/HornoError');
const { esDelGrupo } = require('../../h360/services/ldap.service');

const SCOPE = 'horno';

// Solo membresía directa (memberOf): un grupo anidado dentro de INCOL_APP no da acceso.
const perteneceAlGrupo = (memberOf, grupo) => Array.isArray(memberOf) && memberOf.some((dn) => esDelGrupo(dn, grupo));

function firmarToken({ usuario, nombre, email }, { jwtSecret, jwtExpires }) {
  return jwt.sign(
    { scope: SCOPE, nombre: nombre ?? null, email: email ?? null },
    jwtSecret,
    { subject: usuario, algorithm: 'HS256', expiresIn: jwtExpires },
  );
}

const sesionInvalida = () => new HornoError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw sesionInvalida();
  }
  if (p.scope !== SCOPE || !p.sub || !Number.isInteger(p.exp)) throw sesionInvalida();
  return { usuario: p.sub, nombre: p.nombre ?? null, email: p.email ?? null, exp: p.exp };
}

/** Lo que el front recibe del usuario en sesión. */
const usuarioPublico = ({ usuario, nombre, email }) => ({ usuario, nombre: nombre ?? null, email: email ?? null });

module.exports = { SCOPE, perteneceAlGrupo, firmarToken, verificarToken, usuarioPublico };
