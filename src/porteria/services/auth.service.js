// Roles de Portería por grupo del AD y JWT propio del módulo (scope 'porteria').
const jwt = require('jsonwebtoken');
const PorteriaError = require('../utils/PorteriaError');

const ROLES = Object.freeze({ ADMIN: 'admin_porteria', GUARDA: 'guarda' });
const SCOPE = 'porteria';

// memberOf trae DNs ("CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local"). Se compara el CN exacto:
// con "contiene", un grupo "Porteria" coincidiría también con "PorteriaAdmins".
const esDelGrupo = (dn, grupo) => String(dn).toLowerCase().startsWith(`cn=${String(grupo).toLowerCase()},`);

/** El rol de más alcance que le dan sus grupos, o null si no tiene acceso a Portería. */
function rolDesdeGrupos(memberOf, grupos) {
  const pertenece = (grupo) => Boolean(grupo) && memberOf.some((dn) => esDelGrupo(dn, grupo));
  if (pertenece(grupos.admin) || pertenece(grupos.adminGeneral)) return ROLES.ADMIN;
  if (pertenece(grupos.guarda)) return ROLES.GUARDA;
  return null;
}

function firmarToken({ usuario, nombre, rol, sede }, { jwtSecret, jwtExpires }) {
  return jwt.sign(
    { scope: SCOPE, nombre, rol, sede_id: sede ? sede.id : null, sede_nombre: sede ? sede.nombre : null },
    jwtSecret,
    { subject: usuario, expiresIn: jwtExpires, algorithm: 'HS256' },
  );
}

const sesionInvalida = () => new PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw sesionInvalida();
  }
  if (p.scope !== SCOPE || !p.sub || !Object.values(ROLES).includes(p.rol)) throw sesionInvalida();
  return { usuario: p.sub, nombre: p.nombre, rol: p.rol, sede_id: p.sede_id ?? null, sede_nombre: p.sede_nombre ?? null };
}

/** Lo que el front recibe del usuario en sesión. */
function usuarioPublico({ usuario, nombre, rol, sede_id, sede_nombre }) {
  return { usuario, nombre, rol, sede: sede_id ? { id: sede_id, nombre: sede_nombre } : null };
}

module.exports = { ROLES, rolDesdeGrupos, firmarToken, verificarToken, usuarioPublico };
