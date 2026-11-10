// Rol de Masajes desde los grupos del AD y JWT propio del módulo (scope 'masajes'). Patrón de Portería
// (src/porteria/services/auth.service.js), con una diferencia: aquí el grupo admin se compara por DN EXACTO.
const jwt = require('jsonwebtoken');
const { E } = require('../utils/MasajesError');
const { claveNombre, PARTICULAS } = require('./listadoXlsx');

const ROLES = Object.freeze({ ADMIN: 'admin_masajes', EMPLEADO: 'empleado' });
const SCOPE = 'masajes';

// memberOf trae DNs completos (CN=…,OU=…,DC=olivos,DC=local). Se compara el DN entero (spec §9.2):
// ni subcadena (el error de detectarRoles en H360) ni solo CN, porque un grupo homónimo en otra OU daría admin.
const normalizarDn = (dn) => String(dn).split(',').map((p) => p.trim()).join(',').toLowerCase();

function rolDesdeGrupos(memberOf, grupoAdminDn) {
  if (!grupoAdminDn || !Array.isArray(memberOf)) return ROLES.EMPLEADO;
  const objetivo = normalizarDn(grupoAdminDn);
  return memberOf.some((dn) => normalizarDn(dn) === objetivo) ? ROLES.ADMIN : ROLES.EMPLEADO;
}

// Misma regla que H360 y Portería: lo que va antes de '@' o después de '\', en minúsculas.
function normalizarUsuario(raw) {
  const u = String(raw ?? '').trim().toLowerCase();
  if (u.includes('@')) return u.split('@')[0];
  if (u.includes('\\')) return u.split('\\')[1];
  return u;
}

function firmarToken({ usuario, nombre, rol }, { jwtSecret, jwtExpires }) {
  return jwt.sign({ scope: SCOPE, nombre, rol }, jwtSecret, { subject: usuario, algorithm: 'HS256', expiresIn: jwtExpires });
}

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw E.NO_AUTENTICADO();
  }
  if (!p || p.scope !== SCOPE || !p.sub || !Number.isInteger(p.exp) || !Object.values(ROLES).includes(p.rol)) {
    throw E.NO_AUTENTICADO();
  }
  return { usuario: p.sub, nombre: p.nombre, rol: p.rol, exp: p.exp };
}

const palabras = (s) => claveNombre(s || '').split(' ').filter((w) => w.length >= 2 && !PARTICULAS.has(w));

/**
 * Guarda extra de la autovinculación por correo: el nombre de la cuenta del AD y el del beneficiario deben
 * compartir al menos dos palabras (o todas, si alguno tiene una sola). Evita vincular a otra persona que tenga
 * un correo coincidente (p. ej. una cuenta de recepción con el buzón de un colaborador).
 */
function nombresCompatibles(nombreAd, nombreBeneficiario) {
  const a = palabras(nombreAd);
  const b = new Set(palabras(nombreBeneficiario));
  if (a.length === 0 || b.size === 0) return false;
  const comunes = new Set(a.filter((w) => b.has(w))).size;
  return comunes >= Math.min(2, a.length, b.size);
}

module.exports = { ROLES, SCOPE, rolDesdeGrupos, normalizarDn, normalizarUsuario, firmarToken, verificarToken, nombresCompatibles };
