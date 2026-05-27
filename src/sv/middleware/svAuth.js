/**
 * sv/middleware/svAuth.js
 * Verifica el access token del módulo SerVentas (JWT independiente de Mantix).
 * Carga el usuario con su rol/área/grupo/punto y lo pone en req.user / req.svUser.
 */
const { verifyAccess } = require('../utils/jwt');
const { fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { SvUsuario, SvRol, SvArea, SvGrupo, SvPunto } = require('../models');

async function svAuth(req, res, next) {
  try {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Token no provisto');
    }

    let decoded;
    try {
      decoded = verifyAccess(token);
    } catch (e) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Token inválido o expirado');
    }

    const usuario = await SvUsuario.findByPk(decoded.usr_id, {
      include: [
        { model: SvRol,   as: 'rol' },
        { model: SvArea,  as: 'area' },
        { model: SvGrupo, as: 'grupo' },
        { model: SvPunto, as: 'punto' },
        { model: SvGrupo, as: 'gruposExtra' },
        { model: SvArea,  as: 'areasExtra' }
      ]
    });

    if (!usuario || !usuario.usr_activo) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Usuario inactivo o inexistente');
    }

    req.user   = usuario;
    req.svUser = usuario;
    req.token  = token;
    return next();
  } catch (e) {
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Error de autenticación');
  }
}

module.exports = { svAuth };
