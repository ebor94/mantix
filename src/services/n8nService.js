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

module.exports = { notificarN8n };
