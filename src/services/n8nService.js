// ============================================
// Servicio para comunicación con n8n (red interna LAN)
// El backend llama a n8n; n8n nunca está expuesto a internet
// ============================================
const axios = require('axios');

const N8N_URL      = process.env.N8N_WEBHOOK_URL || 'http://192.9.17.10:5678/webhook/procesar-documentos';
const CALLBACK_URL = process.env.R44_CALLBACK_URL || `${process.env.API_BASE_URL || 'https://mantix-api.losolivoscucuta.com:8444/api'}/r44/extraccion/resultado`;

/**
 * Dispara el procesamiento de documentos en n8n (fire-and-forget).
 * n8n responde ACK en < 1 s y procesa de forma asíncrona.
 */
async function notificarN8n(proveedorId, archivos) {
  const payload = {
    proveedor_id: proveedorId,
    callback_url: CALLBACK_URL,
    archivos,
  };

  try {
    const res = await axios.post(N8N_URL, payload, { timeout: 5000 });
    return res.data;
  } catch (err) {
    // No propagamos el error — el proceso de extracción es asíncrono
    // El estado quedará en 'documentos_cargados' y n8n reintentará
    console.error('[n8nService] Error notificando a n8n:', err.message);
    return null;
  }
}

module.exports = { notificarN8n };
