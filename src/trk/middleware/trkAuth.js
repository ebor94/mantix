const jwt = require('jsonwebtoken');
const db = require('../../models');
const { resolverUsuarioDesdeToken, requirePermiso } = require('../../middleware/auth');
const TrkError = require('../utils/TrkError');
const aw = require('../utils/aw');
const { tienePermiso } = require('../utils/permisos');
const { verificarEntorno } = require('../config/verificarEntorno');

const conRol = { include: [{ model: db.Rol, as: 'rol' }] };

/**
 * Acepta dos tokens:
 *  - PIN (TRK_JWT_SECRET, scope 'trk', tv = trk_accesos.token_version)
 *  - Mantix (JWT_SECRET o SSO), vía resolverUsuarioDesdeToken del repo.
 */
async function resolverSesion(token) {
  if (!token || !verificarEntorno().ok) return null;
  try {
    const d = jwt.verify(token, process.env.TRK_JWT_SECRET);
    if (d && d.scope === 'trk') {
      const [usuario, acceso] = await Promise.all([db.Usuario.findByPk(d.id, conRol), db.TrkAcceso.findByPk(d.id)]);
      if (!usuario || !usuario.activo || !acceso || acceso.token_version !== d.tv) return null;
      return { usuario, tipo: 'PIN' };
    }
  } catch (_) { /* no es un token de PIN válido: probar token de Mantix */ }

  const usuario = await resolverUsuarioDesdeToken(token);
  if (!usuario || !usuario.activo) return null;
  return { usuario, tipo: 'MANTIX' };
}

const leerToken = (req) => {
  const h = req.header('Authorization');
  return h ? h.replace('Bearer ', '') : null;
};

const trkAuth = aw(async (req, res, next) => {
  const sesion = await resolverSesion(leerToken(req));
  if (!sesion) throw new TrkError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');
  req.usuario = sesion.usuario;
  req.trkSesion = sesion;
  next();
});

const trkAuthOpcional = aw(async (req, res, next) => {
  const sesion = await resolverSesion(leerToken(req));
  if (sesion) {
    req.usuario = sesion.usuario;
    req.trkSesion = sesion;
  }
  next();
});

// Reutiliza el RBAC de Mantix: roles.permisos.trk.<accion> (super admin pasa siempre).
const trkPermiso = (accion) => requirePermiso('trk', accion);

// Pasa si el usuario tiene alguno de los permisos TRK indicados (misma fuente: roles.permisos.trk).
const trkPermisoAlguno = (...acciones) => (req, res, next) => {
  if (acciones.some((a) => tienePermiso(req.usuario, a))) return next();
  return next(new TrkError(403, 'SIN_PERMISO', `Requiere uno de: ${acciones.join(', ')}`));
};

module.exports = { resolverSesion, trkAuth, trkAuthOpcional, trkPermiso, trkPermisoAlguno, leerToken };
