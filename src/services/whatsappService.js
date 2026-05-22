// ============================================
// src/services/whatsappService.js
// Servicio de envío WhatsApp via 1msg API
// Usa plantilla "toke_acceso" con sendTemplate
// ============================================
const axios = require('axios');
const fs    = require('fs');
const logger = require('../utils/logger');

// Datos de la instancia 1msg (hardcoded como fallback, se sobreescriben con .env)
const DEFAULT_INSTANCE = 'VID182868781';
const DEFAULT_TOKEN    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpbnN0YW5jZUlkIjoiVklEMTgyODY4NzgxIiwidG9rZW4iOiJUS055V0R4QldpSEw1aTJOVHpLSkxxdzdrR1FNMWpZbiIsImlzcyI6IjFtc2cuaW8iLCJpYXQiOjE3NjE2ODgxODd9._ws7V6bGw8WrWFGQc8ReGHith75qzDwUmTKJEg2pAAM';
const NAMESPACE        = '8297ac0c_48d8_4ec6_a482_3b545f0544ed';
const TEMPLATE_NAME    = 'toke_acceso';

/**
 * Envía el código OTP de votación usando la plantilla de WhatsApp de 1msg.
 *
 * @param {string} telefono     - Número del votante (se formatea automáticamente)
 * @param {string} otp          - Código OTP de 5 dígitos a enviar
 * @param {string} nombreEvento - Nombre del evento (no se usa en la plantilla actual)
 */
async function sendOTP(telefono, otp, nombreEvento = 'votación') {
  const instance = process.env.MSG1_INSTANCE || DEFAULT_INSTANCE;
  const token    = process.env.MSG1_TOKEN    || DEFAULT_TOKEN;

  const numero = formatearTelefono(telefono);

  // Modo desarrollo sin credenciales: solo loguear
  if (!instance || !token) {
    logger.warn('[WhatsApp] Credenciales 1msg no configuradas — modo DEV');
    logger.info(`[WhatsApp DEV] OTP ${otp} para ${numero} (evento: ${nombreEvento})`);
    return { success: true, dev: true };
  }

  const payload = {
    token,
    namespace: NAMESPACE,
    template: TEMPLATE_NAME,
    language: {
      policy: 'deterministic',
      code: 'es',
    },
    params: [
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: otp,           // El código OTP reemplaza el parámetro del cuerpo
          },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        parameters: [
          {
            type: 'text',
            text: 'copy',        // Parámetro del botón de copia
          },
        ],
      },
    ],
    phone: numero,
  };

  try {
    const response = await axios.post(
      `https://api.1msg.io/${instance}/sendTemplate`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );

    logger.info(`[WhatsApp] OTP enviado a ${numero} | ID: ${response.data?.id || 'ok'}`);
    return { success: true, data: response.data };
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data || error.message;
    logger.error(`[WhatsApp] Error enviando OTP a ${numero}: ${JSON.stringify(msg)}`);
    throw new Error(`Error al enviar WhatsApp: ${msg}`);
  }
}

/**
 * Formatea el número de teléfono al formato requerido por 1msg.
 * Colombia: código de país 57 + 10 dígitos (sin el +)
 * Ejemplo: "3143678786" → "573143678786"
 */
function formatearTelefono(telefono) {
  let numero = String(telefono).replace(/\D/g, '');

  // Ya tiene código Colombia completo (57 + 10 dígitos)
  if (numero.startsWith('57') && numero.length === 12) {
    return numero;
  }

  // Celular colombiano sin código de país (10 dígitos empezando en 3)
  if (numero.startsWith('3') && numero.length === 10) {
    return `57${numero}`;
  }

  // Con 0 al inicio (formato antiguo)
  if (numero.startsWith('0') && numero.length === 11) {
    return `57${numero.slice(1)}`;
  }

  return numero;
}

/**
 * Envía el mensaje de aceptación de tratamiento de datos al afiliado
 * usando la plantilla "aceptacion" de 1msg.
 * No lanza excepción — si falla solo registra un warn, el registro ya fue guardado.
 *
 * @param {string} celular - Número del afiliado (se formatea automáticamente)
 */
async function sendAceptacion(celular) {
  const instance = process.env.MSG1_INSTANCE || DEFAULT_INSTANCE;
  const token    = process.env.MSG1_TOKEN    || DEFAULT_TOKEN;
  const numero   = formatearTelefono(celular);

  const payload = {
    token,
    namespace: NAMESPACE,
    template: 'aceptacion',
    language: { policy: 'deterministic', code: 'es' },
    params: [],
    phone: numero,
  };

  try {
    const response = await axios.post(
      `https://api.1msg.io/${instance}/sendTemplate`,
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    logger.info(`[WhatsApp] Aceptación enviada a ${numero} | ID: ${response.data?.id || 'ok'}`);
    return { success: true, data: response.data };
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data || error.message;
    logger.warn(`[WhatsApp] Error enviando aceptación a ${numero}: ${JSON.stringify(msg)}`);
    return { success: false, error: msg }; // No lanza — no debe bloquear el registro
  }
}

/**
 * Envía un archivo (PDF/imagen) al cliente por WhatsApp vía 1msg.
 * Usa el endpoint /sendFile de 1msg.io con la URL pública del archivo.
 *
 * No lanza excepción: en caso de error solo registra warn y retorna
 * { success: false } — el recibo ya fue guardado.
 *
 * @param {string} celular     Número del cliente (se formatea)
 * @param {string} urlArchivo  URL pública completa al archivo (debe ser accesible desde internet)
 * @param {string} fileName    Nombre del archivo tal como verá el cliente (ej. "MP-000001.pdf")
 * @param {string} caption     Mensaje opcional que acompaña el archivo
 * @returns {Promise<{success:boolean,data?:any,error?:any}>}
 */
async function sendDocumento(celular, urlArchivo, fileName, caption = '') {
  const instance = process.env.MSG1_INSTANCE || DEFAULT_INSTANCE;
  const token    = process.env.MSG1_TOKEN    || DEFAULT_TOKEN;
  const numero   = formatearTelefono(celular);

  if (!urlArchivo) {
    logger.warn('[WhatsApp] sendDocumento: body vacío — no se envía');
    return { success: false, error: 'body vacío' };
  }

  // 1msg sendFile rechaza saltos de linea/tabs y >4 espacios consecutivos en caption.
  const cleanCaption = (caption || '')
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {4,}/g, '   ')
    .trim();

  // 1msg acepta URL pública (https://...) o base64 (data:application/pdf;base64,...)
  const payload = {
    token,
    phone: numero,
    body: urlArchivo,
    filename: fileName,
    caption: cleanCaption
  };

  try {
    const response = await axios.post(
      `https://api.1msg.io/${instance}/sendFile`,
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    logger.info(`[WhatsApp] Documento ${fileName} enviado a ${numero} | ID: ${response.data?.id || 'ok'}`);
    return { success: true, data: response.data };
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data || error.message;
    logger.warn(`[WhatsApp] Error enviando documento a ${numero}: ${JSON.stringify(msg)}`);
    return { success: false, error: msg };
  }
}

/**
 * Envía el PDF de un recibo de caja por WhatsApp usando base64.
 * Lee el archivo desde el disco (ruta absoluta) y lo codifica para evitar
 * problemas de acceso de red cuando 1msg no puede descargar la URL pública.
 *
 * @param {string} celular
 * @param {string} localFilePath  Ruta absoluta al archivo PDF en el servidor
 * @param {string} numeroRecibo
 * @param {number|string} valor
 */
async function sendDocumentoRecibo(celular, localFilePath, numeroRecibo, valor) {
  const valorFormateado = Number(valor || 0).toLocaleString('es-CO');
  // 1msg sendFile rechaza saltos de linea, tabs y >4 espacios consecutivos en el caption.
  const caption = `📄 Recibo de caja ${numeroRecibo} · Valor recibido: $${valorFormateado} · Gracias por confiar en nosotros — Los Olivos / Serfunorte.`;

  // Leer archivo y codificar en base64 para evitar dependencia de URL pública
  let body;
  try {
    const fileBuffer = fs.readFileSync(localFilePath);
    body = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
    logger.info(`[WhatsApp] PDF ${numeroRecibo} codificado en base64 (${Math.round(fileBuffer.length / 1024)} KB)`);
  } catch (readErr) {
    logger.warn(`[WhatsApp] No se pudo leer el PDF en ${localFilePath}: ${readErr.message}`);
    return { success: false, error: `No se pudo leer el archivo PDF: ${readErr.message}` };
  }

  return sendDocumento(celular, body, `${numeroRecibo}.pdf`, caption);
}

module.exports = { sendOTP, sendAceptacion, sendDocumento, sendDocumentoRecibo };
