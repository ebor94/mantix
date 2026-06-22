/**
 * sv/middleware/svAuth.js
 * Verifica el access token del módulo SerVentas. Acepta DOS formatos:
 *   1. JWT propio SV (legacy)  — payload { usr_id }, secret SV_JWT_SECRET.
 *   2. JWT del SSO de identidad — payload { kind:'identidad', id_identidad },
 *      secret IDENTIDAD_JWT_SECRET. Se resuelve el usuario SV vía la FK
 *      usr_id_identidad.
 *
 * Esto permite hacer login centralizado en /portal sin romper los flujos
 * que ya tienen tokens SV viejos en localStorage.
 */
const jwt = require('jsonwebtoken');
const { verifyAccess } = require('../utils/jwt');
const { fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { SvUsuario, SvRol, SvArea, SvGrupo, SvPunto } = require('../models');
const { enriquecerAccesoCruzado } = require('../utils/accesoCruzado');

const IDENTIDAD_JWT_SECRET = process.env.IDENTIDAD_JWT_SECRET || process.env.JWT_SECRET;

const INCLUDE_USUARIO = [
  { model: SvRol,   as: 'rol' },
  { model: SvArea,  as: 'area' },
  { model: SvGrupo, as: 'grupo' },
  { model: SvPunto, as: 'punto' },
  { model: SvGrupo, as: 'gruposExtra' },
  { model: SvArea,  as: 'areasExtra' }
];

async function resolverUsuarioSv(token) {
  // Intento 1: JWT propio SV (verifyAccess usa SV_JWT_SECRET)
  try {
    const decoded = verifyAccess(token);
    if (decoded && decoded.usr_id) {
      return SvUsuario.findByPk(decoded.usr_id, { include: INCLUDE_USUARIO });
    }
  } catch (_) { /* fall through */ }

  // Intento 2: JWT del SSO de identidad
  try {
    const decoded = jwt.verify(token, IDENTIDAD_JWT_SECRET);
    if (decoded && decoded.kind === 'identidad' && decoded.id_identidad) {
      return SvUsuario.findOne({
        where: { usr_id_identidad: decoded.id_identidad },
        include: INCLUDE_USUARIO
      });
    }
  } catch (_) { /* fall through */ }

  return null;
}

async function svAuth(req, res, next) {
  try {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Token no provisto');
    }

    const usuario = await resolverUsuarioSv(token);

    if (!usuario || !usuario.usr_activo) {
      return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Token inválido o usuario inactivo');
    }

    await enriquecerAccesoCruzado(usuario);

    req.user   = usuario;
    req.svUser = usuario;
    req.token  = token;
    return next();
  } catch (e) {
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Error de autenticación');
  }
}

module.exports = { svAuth };
