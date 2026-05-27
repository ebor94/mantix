/**
 * sv/utils/hashRefresh.js
 * Hash SHA-256 del refresh token para almacenarlo en sv_org_sesiones.
 * Nunca guardamos el JWT crudo.
 */
const crypto = require('crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { sha256 };
