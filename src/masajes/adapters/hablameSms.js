// Cliente de SMS de Háblame, API v5 (contrato confirmado en docs.hablame.co el 2026-11-10, ver notas-masajes.md §7):
//   POST https://www.hablame.co/api/sms/v5/send · cabecera X-Hablame-Key · { messages: [{ to, text }], priority }
//   200 → { statusCode: 200, payLoad: { messages: [{ id, ... }] } } · errores → { statusCode, errorCode, statusMessage }
// La URL sale de MSJ_HABLAME_URL (https obligatorio). La API key va en la cabecera, nunca en la URL ni en el cuerpo
// (la doc permite ambas; las URL terminan en logs de proxies).
const axios = require('axios');
const { SMS_MAX } = require('../plantillas');

const MOVIL_CO = /^573\d{9}$/;
const GSM_SEGURO = /^[A-Za-z0-9 .,:;!?()/@#%&*+=_-]*$/;

class ErrorHablame extends Error {
  constructor(message, { status, errorCode, reintentable }) {
    super(message);
    this.name = 'ErrorHablame';
    this.status = status;
    this.errorCode = errorCode;
    this.reintentable = reintentable;
  }
}

function crearClienteHablame({ url, apiKey, http = axios.create({ timeout: 10000, maxRedirects: 0 }) }) {
  if (!/^https:\/\//.test(String(url || ''))) throw new Error('HABLAME_URL_INVALIDA');
  if (!apiKey) throw new Error('HABLAME_SIN_API_KEY');

  /** Envía un SMS transaccional. Devuelve { id } o lanza ErrorHablame con un mensaje sin la API key. */
  async function enviar(to, text) {
    if (!MOVIL_CO.test(String(to))) throw new ErrorHablame('Celular inválido para SMS', { reintentable: false });
    if (typeof text !== 'string' || text.length === 0 || text.length > SMS_MAX || !GSM_SEGURO.test(text)) {
      throw new ErrorHablame('Texto de SMS inválido (vacío, más de 160 o fuera de GSM-7)', { reintentable: false });
    }
    let r;
    try {
      r = await http.post(url, { priority: true, messages: [{ to, text }] }, {
        headers: { 'X-Hablame-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        validateStatus: () => true, // se decide aquí abajo, sin que axios arme un error con la config (y la key) dentro
      });
    } catch (err) {
      // Timeout, DNS, conexión: solo el código, nunca err.config (trae las cabeceras).
      throw new ErrorHablame(`Háblame no respondió (${err.code || 'ERROR_RED'})`, { reintentable: true });
    }
    const cuerpo = r.data && typeof r.data === 'object' ? r.data : {};
    const id = cuerpo.payLoad && Array.isArray(cuerpo.payLoad.messages) && cuerpo.payLoad.messages[0] && cuerpo.payLoad.messages[0].id;
    if (r.status === 200 && Number(cuerpo.statusCode) === 200 && id) return { id: String(id) };

    const status = r.status;
    const errorCode = cuerpo.errorCode;
    const detalle = typeof cuerpo.statusMessage === 'string' ? cuerpo.statusMessage.slice(0, 120) : '';
    // 401/403: credencial o cuerpo malos (no mejora reintentando); 429 y 5xx sí.
    const reintentable = status === 429 || status >= 500 || (status >= 300 && status < 400);
    throw new ErrorHablame(`Háblame respondió ${status}${errorCode ? ` (errorCode ${errorCode})` : ''}${detalle ? `: ${detalle}` : ''}`, { status, errorCode, reintentable });
  }

  return { enviar };
}

module.exports = { crearClienteHablame, ErrorHablame };
