/**
 * sv/services/googleChat.service.js — SP-3
 * Envía mensajes al webhook de Google Chat para notificar OTPs
 * de edición de eventos al canal donde están los jefes.
 * Nunca loguea la URL del webhook ni el OTP en claro fuera del log estructurado.
 */
const axios = require('axios');

function fmtCambios(cambios) {
  const keys = Object.keys(cambios || {});
  if (!keys.length) return '(sin detalles)';
  return keys.slice(0, 8).map(k => `• ${k}`).join('\n');
}

async function enviarOtp({ evento, usuario, cambios, otp }) {
  const url = process.env.GCHAT_WEBHOOK_EVENTOS;
  if (!url) {
    const err = new Error('GCHAT_WEBHOOK_EVENTOS no configurado');
    err.code = 'GCHAT_FAIL';
    throw err;
  }

  const nombre = `${usuario.usr_nombre || ''} ${usuario.usr_apellido || ''}`.trim() || `Usuario #${usuario.usr_id}`;
  const text =
    `*OTP edición de evento* — vence en 10 min\n` +
    `Asesor: *${nombre}* (#${usuario.usr_id})\n` +
    `Evento: *${evento.evento_titulo}* (#${evento.evento_id})\n` +
    `Cambios propuestos:\n${fmtCambios(cambios)}\n\n` +
    `Código: *${otp}*\n` +
    `Compártelo con el asesor SOLO si autorizas el cambio.`;

  const t0 = Date.now();
  try {
    await axios.post(url, { text }, { timeout: 5000 });
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ tag: 'OTP_SENT', evento_id: evento.evento_id, usr_id: usuario.usr_id, canal: 'google_chat', tiempo_gchat_ms: ms }));
    return { ok: true, ms };
  } catch (e) {
    console.log(JSON.stringify({ tag: 'GCHAT_ERROR', tipo: e.code || 'unknown', detalle: e.message?.slice(0, 200) }));
    const err = new Error('No se pudo enviar el OTP a Google Chat');
    err.code = 'GCHAT_FAIL';
    throw err;
  }
}

module.exports = { enviarOtp };
