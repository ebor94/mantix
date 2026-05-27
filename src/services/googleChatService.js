/**
 * googleChatService.js
 * Envía notificaciones al espacio de Google Chat via webhook.
 * Todas las llamadas son fire-and-forget: los errores se loguean pero no interrumpen el flujo principal.
 */

const axios  = require('axios');
const logger = require('../utils/logger');

const WEBHOOK_URL = process.env.GOOGLE_CHAT_WEBHOOK ||
  'https://chat.googleapis.com/v1/spaces/AAQA2yKekbI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=CtMecvGWUg0Grm8njnTDIweSY3dYqXhBa2jDCp3KozM';

/**
 * Envía un mensaje de texto simple al chat.
 * @param {string} text
 */
async function sendMessage(text) {
  try {
    await axios.post(WEBHOOK_URL, { text }, { timeout: 8000 });
  } catch (err) {
    logger.warn(`[GoogleChat] Error al enviar notificación: ${err.message}`);
  }
}

/**
 * Notificación: nuevo afiliado Veolia registrado.
 */
function notificarNuevoVeolia(afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre, afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ');
  const doc  = `${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`;
  const cel  = afiliado.celular || '—';
  const benef = afiliado.beneficiarios?.length ?? 0;
  const asist = afiliado.asistenciaFueraDeCasa === 'SI' ? '✅ Sí' : afiliado.asistenciaFueraDeCasa === 'NO' ? '❌ No' : '—';

  const text = [
    `🟢 *Nuevo registro Veolia*`,
    `👤 *Afiliado:* ${nombre}`,
    `🪪 *Documento:* ${doc}`,
    `📱 *Celular:* ${cel}`,
    `👨‍👩‍👧 *Beneficiarios:* ${benef}`,
    `🏠 *Asistencia fuera de casa:* ${asist}`
  ].join('\n');

  sendMessage(text).catch(() => {});
}

/**
 * Notificación: afiliado reenviada corrección para aprobación.
 */
function notificarCorreccionVeolia(afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre, afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ');
  const doc = `${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`;

  const text = [
    `🔄 *Corrección reenviada para aprobación*`,
    `👤 *Afiliado:* ${nombre}`,
    `🪪 *Documento:* ${doc}`,
    `📋 *Origen:* ${afiliado.origen || 'VEOLIA'}`,
    `📌 Se ha corregido la afiliación y está pendiente de nueva revisión.`
  ].join('\n');

  sendMessage(text).catch(() => {});
}

module.exports = { notificarNuevoVeolia, notificarCorreccionVeolia };
