// ============================================
// src/utils/otpStore.js
// Almacén en memoria de códigos OTP con TTL automático.
// No persiste en base de datos — se pierde al reiniciar el servidor.
// Para producción con múltiples instancias usar Redis; en este caso
// el servicio corre en una sola instancia por lo que es suficiente.
// ============================================

const store = new Map();
const TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Guarda un OTP asociado a una clave (ej: numeroDocumento o "reenvio:id").
 * Si ya existía uno previo para esa clave, lo sobreescribe.
 * @param {string} key
 * @param {string|number} otp
 */
function set(key, otp) {
  store.set(key, {
    otp: String(otp),
    expiresAt: Date.now() + TTL_MS
  });
  // Limpieza automática al expirar
  setTimeout(() => store.delete(key), TTL_MS);
}

/**
 * Verifica si el OTP es correcto y no ha expirado.
 * Si es válido lo consume (one-time use).
 * @param {string} key
 * @param {string|number} otp
 * @returns {boolean}
 */
function verify(key, otp) {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  if (entry.otp !== String(otp)) return false;
  store.delete(key); // consumir
  return true;
}

/**
 * Verifica si existe un OTP pendiente para la clave (sin consumirlo).
 */
function has(key) {
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(key); return false; }
  return true;
}

module.exports = { set, verify, has };
