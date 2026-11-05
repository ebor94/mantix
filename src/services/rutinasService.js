// =============================================================
// src/services/rutinasService.js
// Utilidades para rutinas de pre-ejecución (QR scan).
// =============================================================
const crypto = require('crypto');

const TOKEN_VALIDO_DIAS = 365; // tiempo tras fecha_programada (1 año — práctico para auditoría histórica)

function generarToken() {
  // 32 bytes → 64 hex chars (coincide con VARCHAR(64) de la columna)
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Devuelve el token actual del MNT programado o genera uno nuevo y lo persiste.
 * No pisa tokens existentes.
 */
async function obtenerOGenerarToken(mantenimientoProgramado) {
  if (mantenimientoProgramado.token_qr) return mantenimientoProgramado.token_qr;
  const token = generarToken();
  await mantenimientoProgramado.update({ token_qr: token });
  return token;
}

function urlPublicaRutina(baseUrl, token) {
  const base = (baseUrl || process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, '');
  return `${base}/rutina/${token}`;
}

function tokenVigente(fechaProgramada) {
  if (!fechaProgramada) return true;
  const fp = new Date(fechaProgramada);
  if (isNaN(fp.getTime())) return true;
  const limite = new Date(fp);
  limite.setDate(limite.getDate() + TOKEN_VALIDO_DIAS);
  return Date.now() <= limite.getTime();
}

module.exports = {
  generarToken,
  obtenerOGenerarToken,
  urlPublicaRutina,
  tokenVigente,
  TOKEN_VALIDO_DIAS
};
