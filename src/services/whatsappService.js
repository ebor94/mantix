// ============================================
// src/services/whatsappService.js
// Servicio de envío WhatsApp via 1msg API
// Usa plantilla "toke_acceso" con sendTemplate
// ============================================
const axios = require('axios');
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

module.exports = { sendOTP };
