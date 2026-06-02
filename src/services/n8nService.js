// ============================================
// Servicio para comunicación con n8n (red interna LAN)
// El backend lee los archivos y envía base64 directamente,
// así n8n no necesita acceso al disco ni módulo fs.
// ============================================
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const N8N_URL      = process.env.N8N_WEBHOOK_URL || 'http://192.9.17.10:5678/webhook/procesar-documentos';
const CALLBACK_URL = process.env.R44_CALLBACK_URL || `${process.env.API_BASE_URL || 'https://mantix-api.losolivoscucuta.com:8444/api'}/r44/extraccion/resultado`;
const N8N_CERTIFICADO_URL =
  process.env.N8N_CERTIFICADO_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/certificado-afiliacion';
const N8N_FIRMA_URL =
  process.env.N8N_FIRMA_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/afiliado-registro-firma';

const MIME_MAP = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
};

function archivoABase64(ruta) {
  const buffer   = fs.readFileSync(ruta);
  const ext      = path.extname(ruta).slice(1).toLowerCase();
  const mimeType = MIME_MAP[ext] || 'application/pdf';
  return {
    base64:       buffer.toString('base64'),
    mime_type:    mimeType,
    tamano_bytes: buffer.length,
    nombre:       path.basename(ruta),
  };
}

/**
 * Dispara el procesamiento de documentos en n8n (fire-and-forget).
 * Envía los archivos como base64 para que n8n no acceda al disco.
 * archivos = { rut: '/ruta/file.pdf', camara: '...', renta: '...', cedula: '...' }
 */
async function notificarN8n(proveedorId, archivos) {
  // Convertir cada archivo a base64 antes de enviar
  const archivosBase64 = {};
  for (const [tipo, ruta] of Object.entries(archivos)) {
    try {
      archivosBase64[tipo] = { ruta, ...archivoABase64(ruta) };
    } catch (e) {
      console.error(`[n8nService] No se pudo leer ${tipo}: ${e.message}`);
      archivosBase64[tipo] = { ruta, error: e.message };
    }
  }

  const payload = {
    proveedor_id: proveedorId,
    callback_url: CALLBACK_URL,
    archivos:     archivosBase64,
  };

  try {
    const res = await axios.post(N8N_URL, payload, { timeout: 10000 });
    return res.data;
  } catch (err) {
    console.error('[n8nService] Error notificando a n8n:', err.message);
    return null;
  }
}

/**
 * Notifica a n8n para que genere y envíe el certificado de afiliación
 * cuando un afiliado es aprobado. Fire-and-forget: no bloquea el response.
 *
 * @param {number} afiliadoId   ID del afiliado aprobado
 * @param {string} aprobadoPor  Nombre/identificador del aprobador
 *                              (ej. "edwin ortega" o "user:5")
 */
async function notificarCertificadoAfiliacion(afiliadoId, aprobadoPor) {
  try {
    const res = await axios.post(
      N8N_CERTIFICADO_URL,
      { afiliadoId, aprobadoPor },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return res.data;
  } catch (err) {
    // No relanzamos: la aprobación ya quedó persistida; el webhook es secundario
    const msg = err.response?.data || err.message;
    console.error(
      `[n8nService] Error notificando certificado para afiliado ${afiliadoId}:`,
      msg
    );
    return null;
  }
}

/**
 * Notifica a n8n para que envíe la solicitud de firma electrónica al
 * afiliado recién registrado por un asesor (canal estándar — NO Veolia).
 * Fire-and-forget: no bloquea la respuesta al asesor.
 *
 * @param {number} afiliadoId
 */
async function notificarFirma(afiliadoId) {
  try {
    const res = await axios.post(
      N8N_FIRMA_URL,
      { afiliadoId },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return res.data;
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error(
      `[n8nService] Error notificando firma para afiliado ${afiliadoId}:`,
      msg
    );
    return null;
  }
}

module.exports = {
  notificarN8n,
  notificarCertificadoAfiliacion,
  notificarFirma
};
