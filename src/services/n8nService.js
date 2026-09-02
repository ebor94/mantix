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
const N8N_VALIDAR_FIRMA_URL =
  process.env.N8N_VALIDAR_FIRMA_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/validar-firma-afiliado';
const N8N_INVITACION_EMAIL_URL =
  process.env.N8N_INVITACION_EMAIL_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/invitacion-afiliacion-email';
const N8N_DRIVE_URL =
  process.env.N8N_DRIVE_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/archivar-r44-drive';
const N8N_BIENVENIDA_URL =
  process.env.N8N_BIENVENIDA_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/bienvenida-proveedor-r44';
const N8N_APROBACION_PUBLICA_URL =
  process.env.N8N_APROBACION_PUBLICA_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/aprobacion-afiliacion-publica';
const N8N_ANULACION_URL =
  process.env.N8N_ANULACION_WEBHOOK_URL ||
  'http://192.9.17.10:5678/webhook/anulacion-afiliacion';
const PORTAL_URL =
  process.env.R44_PORTAL_URL || 'https://losolivoscucuta.com/portalproveedores/login';
const DRIVE_ROOT_FOLDER_ID =
  process.env.R44_DRIVE_ROOT_FOLDER_ID || '1PN4TRzIfT45vQiD2Q23cD_D66OujQSDn';
const API_BASE =
  process.env.API_BASE_URL || 'https://mantix-api.losolivoscucuta.com:8444/api';

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
 * @param {string|null} carnetUrl  URL pública del carné digital (para que n8n
 *                              lo adjunte al correo y lo suba a Drive)
 */
async function notificarCertificadoAfiliacion(afiliadoId, aprobadoPor, carnetUrl = null) {
  try {
    const res = await axios.post(
      N8N_CERTIFICADO_URL,
      { afiliadoId, aprobadoPor, carnetUrl },
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

/**
 * Dispara el workflow n8n de validación de firma Adobe para un afiliado a
 * demanda (desde /mis-afiliaciones-dia). El webhook responde onReceived; el
 * flujo (búsqueda Gmail por el correo → Drive → marcar firmado) corre async.
 * @param {number} afiliadoId
 * @param {string} email  Correo del afiliado (para la búsqueda en Gmail)
 * @returns {Promise<true|null>} true si el webhook aceptó (2xx), null si falló
 */
async function notificarValidacionFirma(afiliadoId, email) {
  try {
    await axios.post(
      N8N_VALIDAR_FIRMA_URL,
      { afiliadoId, email },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return true;
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error(
      `[n8nService] Error validando firma para afiliado ${afiliadoId}:`,
      msg
    );
    return null;
  }
}

/**
 * Notifica a n8n para que envíe por correo la invitación de autoafiliación
 * (convenio/nómina) con la plantilla HTML de Los Olivos. n8n resuelve los
 * datos del empleado/convenio y el link a partir del invitacionId.
 *
 * A diferencia de firma, este SÍ se espera (await) desde enviarInvitacion,
 * para que un fallo del webhook se propague y RRHH vea el error en vez de
 * marcar la invitación como enviada cuando el correo no salió.
 *
 * @param {number} invitacionId
 */
async function notificarInvitacionEmail(invitacionId) {
  const res = await axios.post(
    N8N_INVITACION_EMAIL_URL,
    { invitacionId },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return res.data;
}

/**
 * Archiva los documentos del proveedor en Google Drive (organizados por año)
 * vía un workflow n8n dedicado. Fire-and-forget.
 *
 * @param {object} opts
 * @param {number} opts.proveedorId
 * @param {number} opts.anio         año de vinculación (carpeta de primer nivel)
 * @param {string} opts.carpeta      nombre de la subcarpeta del proveedor: "Nombre (NIT)"
 * @param {Array<{tipo:string, ruta:string}>} opts.documentos
 */
async function archivarDocumentosEnDrive({ proveedorId, anio, carpeta, documentos }) {
  const archivos = [];
  for (const d of documentos || []) {
    try {
      const info = archivoABase64(d.ruta);
      archivos.push({ tipo: d.tipo, nombre: info.nombre, mime_type: info.mime_type, base64: info.base64 });
    } catch (e) {
      console.error(`[drive] No se pudo leer ${d.tipo}: ${e.message}`);
    }
  }
  if (!archivos.length) return null;

  const payload = {
    proveedor_id:   proveedorId,
    anio:           anio || new Date().getFullYear(),
    carpeta,
    root_folder_id: DRIVE_ROOT_FOLDER_ID,
    callback_url:   `${API_BASE}/r44/documentos/drive`,
    archivos,
  };

  try {
    const res = await axios.post(N8N_DRIVE_URL, payload, { timeout: 15000 });
    return res.data;
  } catch (err) {
    console.error('[drive] Error notificando archivado a n8n:', err.message);
    return null;
  }
}

/**
 * Envía el correo de bienvenida con las credenciales de acceso a un proveedor
 * recién creado por el revisor de compras (vía workflow n8n con Gmail).
 * Se espera (await): si falla, el controlador lo marca como no enviado pero la
 * cuenta ya quedó creada y el revisor entrega las credenciales manualmente.
 *
 * @param {object} opts
 * @param {string} opts.nombre
 * @param {string} opts.email     correo del proveedor (también es el usuario)
 * @param {string} opts.password  contraseña temporal en texto plano
 * @param {string} [opts.tipo]    'vinculacion' | 'actualizacion'
 */
async function notificarBienvenidaProveedor({ nombre, email, password, tipo }) {
  const payload = { nombre, email, password, tipo: tipo || null, url: PORTAL_URL };
  const res = await axios.post(N8N_BIENVENIDA_URL, payload, { timeout: 15000 });
  return res.data;
}

/**
 * Dispara (fire-and-forget) el workflow n8n "Aprobacion Afiliacion" que envía el
 * correo de aprobación a afiliaciones públicas (Veolia/Convenio). El workflow
 * también corre por schedule cada 5 min como respaldo; este webhook lo adelanta
 * para que la notificación salga al momento de aprobar en vez de esperar.
 *
 * @param {number} afiliadoId  Solo informativo/para logs; el workflow procesa el
 *                             siguiente aprobado sin notificar (query propia).
 */
async function notificarAprobacionPublica(afiliadoId) {
  try {
    const res = await axios.post(
      N8N_APROBACION_PUBLICA_URL,
      { afiliadoId },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return res.data;
  } catch (err) {
    console.error(
      `[n8nService] Error disparando aprobación pública (afiliado ${afiliadoId}):`,
      err.message
    );
    return null;
  }
}

/**
 * Dispara (fire-and-forget) el workflow n8n que envía por correo el aviso de
 * ANULACIÓN de una afiliación al cliente. n8n resuelve los datos del afiliado a
 * partir del afiliadoId y envía el correo (Gmail).
 *
 * @param {number} afiliadoId
 * @param {string} motivo      Motivo de la anulación (se muestra en el correo)
 * @param {string} anuladoPor  Nombre/identificador de quien anuló
 */
async function notificarAnulacionAfiliacion(afiliadoId, motivo, anuladoPor) {
  try {
    const res = await axios.post(
      N8N_ANULACION_URL,
      { afiliadoId, motivo, anuladoPor },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return res.data;
  } catch (err) {
    console.error(
      `[n8nService] Error notificando anulación (afiliado ${afiliadoId}):`,
      err.message
    );
    return null;
  }
}

module.exports = {
  notificarN8n,
  notificarCertificadoAfiliacion,
  notificarFirma,
  notificarValidacionFirma,
  notificarAprobacionPublica,
  notificarAnulacionAfiliacion,
  notificarInvitacionEmail,
  archivarDocumentosEnDrive,
  notificarBienvenidaProveedor,
};
