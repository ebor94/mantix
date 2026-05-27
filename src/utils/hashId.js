// ============================================
// src/utils/hashId.js
// Cifrado AES-256-CBC determinístico para ofuscar IDs numéricos en URLs.
// El mismo secreto debe estar en VITE_HASH_SECRET del frontend.
// ============================================

const crypto = require('crypto');

function getKeyIV() {
  const secret = (process.env.HASH_SECRET || 'serfunorte_mantix_hash_2026')
    .padEnd(32, '!').slice(0, 32);
  const key = Buffer.from(secret, 'utf8');                              // 32 bytes → AES-256
  const iv  = Buffer.from(secret.slice(0, 16).padEnd(16, '0'), 'utf8'); // 16 bytes → CBC IV
  return { key, iv };
}

/**
 * Codifica un ID numérico a un hash URL-safe.
 * Mismo ID → mismo hash (determinístico).
 * @param {number} id
 * @returns {string} base64url string
 */
function encodeId(id) {
  const { key, iv } = getKeyIV();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const plaintext = String(id).padStart(8, '0'); // padding para bloque AES uniforme
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return enc.toString('base64url');
}

/**
 * Decodifica un hash a su ID numérico original.
 * Retorna null si el hash es inválido o fue manipulado.
 * @param {string} hash
 * @returns {number|null}
 */
function decodeId(hash) {
  try {
    const { key, iv } = getKeyIV();
    const buf = Buffer.from(hash, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const dec = Buffer.concat([decipher.update(buf), decipher.final()]);
    const id = parseInt(dec.toString('utf8'), 10);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

module.exports = { encodeId, decodeId };
