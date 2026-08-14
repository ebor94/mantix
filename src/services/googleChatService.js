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
 * Notificación: nuevo registro desde un formulario público (Veolia o convenio).
 *
 * @param {object} afiliado
 * @param {object} [opciones]
 * @param {string} [opciones.etiqueta='Veolia'] Nombre que se muestra en el
 *        título del mensaje: 'Veolia', 'CONYCA', etc.
 * @param {boolean} [opciones.mostrarAsistencia=true] La asistencia fuera de
 *        casa no la ofrecen todos los convenios. Por defecto se muestra, para
 *        que el mensaje de Veolia quede exactamente igual que antes.
 */
function notificarNuevoPublico(afiliado, opciones) {
  const opts = opciones || {};
  const etiqueta = opts.etiqueta || 'Veolia';
  const mostrarAsistencia = opts.mostrarAsistencia !== false;
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre, afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ');
  const doc  = `${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`;
  const cel  = afiliado.celular || '—';
  const benef = afiliado.beneficiarios?.length ?? 0;
  const asist = afiliado.asistenciaFueraDeCasa === 'SI' ? '✅ Sí' : afiliado.asistenciaFueraDeCasa === 'NO' ? '❌ No' : '—';

  const lineas = [
    `🟢 *Nuevo registro ${etiqueta}*`,
    `👤 *Afiliado:* ${nombre}`,
    `🪪 *Documento:* ${doc}`,
    `📱 *Celular:* ${cel}`,
    `👨‍👩‍👧 *Beneficiarios:* ${benef}`
  ];
  // La asistencia fuera de casa no la ofrecen todos los convenios; cuando el
  // formulario no la incluye se omite la línea en vez de mostrar un guion.
  if (mostrarAsistencia) {
    lineas.push(`🏠 *Asistencia fuera de casa:* ${asist}`);
  }

  sendMessage(lineas.join('\n')).catch(() => {});
}

/**
 * Notificación: nuevo afiliado Veolia registrado.
 * Se conserva con el mismo nombre y comportamiento para no tocar el flujo de
 * Veolia, que está en producción.
 */
function notificarNuevoVeolia(afiliado) {
  return notificarNuevoPublico(afiliado, { etiqueta: 'Veolia' });
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

/**
 * Notificación: nueva afiliación registrada por un asesor (canal estándar).
 * @param {object} afiliado  Resultado de createAfiliadoWithBeneficiarios (con beneficiarios)
 * @param {string} asesorNombre  Nombre del asesor que registró
 */
function notificarNuevoAsesor(afiliado, asesorNombre) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre, afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ');
  const doc   = `${afiliado.tipoDocumento} ${afiliado.numeroDocumento}`;
  const cel   = afiliado.celular || '—';
  const benef = afiliado.beneficiarios?.length ?? 0;
  const asist = afiliado.asistenciaFueraDeCasa === 'SI' ? '✅ Sí'
              : afiliado.asistenciaFueraDeCasa === 'NO' ? '❌ No' : '—';
  const NOVEDAD = {
    NUEVO: 'Nuevo', CAMBIO: 'Cambio', TRASLADO: 'Traslado', ACTUALIZACION: 'Actualización',
    TRASLADO_COMPETENCIA: 'Traslado Competencia', TRASLADO_CANAL: 'Traslado Canal'
  };
  const novedad = NOVEDAD[afiliado.novedad] || afiliado.novedad || '—';

  const text = [
    `🟢 *Nueva afiliación registrada*`,
    `👤 *Afiliado:* ${nombre}`,
    `🪪 *Documento:* ${doc}`,
    `📱 *Celular:* ${cel}`,
    `🏷️ *Canal:* ${afiliado.canal || '—'}  ·  *Producto:* ${afiliado.producto || '—'}  ·  *Grupo:* ${afiliado.grupo || '—'}`,
    `📋 *Novedad:* ${novedad}`,
    `👨‍👩‍👧 *Beneficiarios:* ${benef}`,
    `🏠 *Asistencia fuera de casa:* ${asist}`,
    `🧑‍💼 *Asesor:* ${asesorNombre || '—'}`
  ].join('\n');

  sendMessage(text).catch(() => {});
}

module.exports = { notificarNuevoVeolia, notificarCorreccionVeolia, notificarNuevoPublico, notificarNuevoAsesor };
