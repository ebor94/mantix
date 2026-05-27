/**
 * sv/utils/jwt.js
 * Generación/verificación de tokens JWT para el módulo SerVentas.
 * Tokens INDEPENDIENTES de los de Mantix (secretos distintos en .env).
 */
const jwt = require('jsonwebtoken');
const { JWT } = require('../config/constants');

function signAccess(payload) {
  return jwt.sign(payload, JWT.ACCESS_SECRET, { expiresIn: JWT.ACCESS_EXPIRES_IN });
}

function signRefresh(payload) {
  return jwt.sign(payload, JWT.REFRESH_SECRET, { expiresIn: JWT.REFRESH_EXPIRES_IN });
}

function verifyAccess(token) {
  return jwt.verify(token, JWT.ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, JWT.REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
