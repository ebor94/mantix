const { createHash } = require('node:crypto');

/** SHA-256 hexadecimal de `valor + sal`. Se usa para IP y user-agent: nunca se guardan en claro. */
function hashConSal(valor, sal) {
  return createHash('sha256').update(valor + sal).digest('hex');
}

module.exports = { hashConSal };
