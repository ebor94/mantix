/**
 * identity/middleware/verifyIdentidad.js
 * Verifica el JWT de identidad (Bearer) y carga req.identidad.
 */
const { OrgIdentidad } = require('../models');
const jwtId = require('../config/jwt');

async function verifyIdentidad(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Token no provisto' });
    }
    let payload;
    try { payload = jwtId.verifyAccess(token); }
    catch (_) {
      return res.status(401).json({ success: false, error: 'TOKEN_INVALID', message: 'Token inválido o expirado' });
    }
    const identidad = await OrgIdentidad.findByPk(payload.id_identidad);
    if (!identidad || !identidad.activo) {
      return res.status(401).json({ success: false, error: 'USER_INACTIVE', message: 'Usuario inactivo' });
    }
    req.identidad = identidad;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { verifyIdentidad };
