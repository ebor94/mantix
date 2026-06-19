/**
 * identity/config/jwt.js
 * Tokens JWT del módulo de identidad SSO. INDEPENDIENTES de los de
 * Mantix (afiliaciones) y SerVentas (genflow). El payload incluye
 * { id_identidad, email } y los middlewares de cada app pueden
 * resolverlo a su usuario local vía FK.
 */
const jwt = require('jsonwebtoken');

const ACCESS_SECRET    = process.env.IDENTIDAD_JWT_SECRET         || process.env.JWT_SECRET;
const REFRESH_SECRET   = process.env.IDENTIDAD_JWT_REFRESH_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + '_id_refresh' : null);
const ACCESS_EXPIRES   = process.env.IDENTIDAD_JWT_EXPIRES_IN         || '30m';
const REFRESH_EXPIRES  = process.env.IDENTIDAD_JWT_REFRESH_EXPIRES_IN || '14d';

function signAccess(payload) {
  return jwt.sign({ ...payload, kind: 'identidad' }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}
function signRefresh(payload) {
  return jwt.sign({ ...payload, kind: 'identidad' }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });
}
function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}
function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, ACCESS_SECRET, REFRESH_SECRET };
