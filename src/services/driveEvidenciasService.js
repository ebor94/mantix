// =============================================================
// src/services/driveEvidenciasService.js
// Encapsula la llamada al webhook de n8n que crea la carpeta
// de jornada en Google Drive y devuelve el link.
// Nunca lanza — si falla, devuelve null y loguea.
// =============================================================
const axios = require('axios');

const DEFAULT_TIMEOUT = 15000; // 15s

/**
 * Dispara la creación de la carpeta de jornada en Drive via n8n.
 *
 * @param {Object} payload - datos del cierre (ver más abajo)
 * @returns {Promise<{drive_jornada_url: string, drive_jornada_folder_id: string}|null>}
 *
 * Shape de payload:
 * {
 *   fecha_ejecucion: 'YYYY-MM-DD',
 *   hora_inicio: 'HH:MM',
 *   hora_fin: 'HH:MM',
 *   proveedor: 'Ingenin Limitada',
 *   tecnico: 'Nombre y apellido',
 *   categoria: 'Aires Acondicionados',
 *   sedes: ['CR','SJ','GC'],
 *   mantenimientos: [
 *     { mnt_codigo:'MNT-2026-0384', equipo_codigo:'EQ-00123', equipo_nombre:'AC CAPILLA', sede:'CR' }
 *   ],
 *   observaciones: '...' // opcional
 * }
 */
async function crearCarpetaJornada(payload) {
  const url = process.env.N8N_WEBHOOK_EVIDENCIAS_URL;
  if (!url) {
    console.warn('[driveEvidencias] N8N_WEBHOOK_EVIDENCIAS_URL no configurado, se omite llamada');
    return null;
  }

  try {
    const resp = await axios.post(url, payload, {
      timeout: DEFAULT_TIMEOUT,
      headers: { 'Content-Type': 'application/json' }
    });
    const data = resp.data || {};
    if (data.drive_jornada_url) {
      return {
        drive_jornada_url: data.drive_jornada_url,
        drive_jornada_folder_id: data.drive_jornada_folder_id || null
      };
    }
    console.warn('[driveEvidencias] respuesta sin drive_jornada_url:', data);
    return null;
  } catch (error) {
    console.error('[driveEvidencias] error llamando al webhook n8n:', error.message);
    return null;
  }
}

module.exports = { crearCarpetaJornada };
