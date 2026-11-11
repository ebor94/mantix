// Correo y Google Calendar a través de n8n (flujo "Masajes — avisos", docs/masajes/n8n-avisos.json).
// Un solo webhook con { accion, ... }. El secreto va en la cabecera X-Masajes-Clave (credencial Header Auth del
// webhook), nunca en la URL ni en el cuerpo. n8n responde con el código de Google (origen: 'google') para que aquí
// se distinga "el evento ya no existe" (404/410) de "el webhook no está activo" (404 de n8n, sin origen).
const axios = require('axios');
const { eventoDe } = require('./googleCalendar');

const CABECERA = 'X-Masajes-Clave';
const UN_CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const ID_EVENTO = /^[a-z0-9_-]{1,1024}$/i;

class ErrorN8n extends Error {
  constructor(message, { status, reintentable }) {
    super(message);
    this.name = 'ErrorN8n';
    this.status = status;
    this.reintentable = reintentable;
  }
}

function crearClienteN8n({ url, secreto, http = axios.create({ timeout: 20000, maxRedirects: 0 }) }) {
  if (!/^https?:\/\//.test(String(url || ''))) throw new Error('N8N_URL_INVALIDA');
  if (!secreto) throw new Error('N8N_SIN_SECRETO');

  /** Devuelve { status, cuerpo, deGoogle }. Solo lanza por red (reintentable), nunca con la config (trae el secreto). */
  async function enviar(accion, datos) {
    let r;
    try {
      r = await http.post(url, { accion, ...datos }, {
        headers: { [CABECERA]: secreto, 'Content-Type': 'application/json', Accept: 'application/json' },
        validateStatus: () => true,
      });
    } catch (err) {
      throw new ErrorN8n(`n8n no respondió (${err.code || 'ERROR_RED'})`, { reintentable: true });
    }
    const cuerpo = r.data && typeof r.data === 'object' ? r.data : {};
    return { status: r.status, cuerpo, deGoogle: cuerpo.origen === 'google' };
  }

  return { enviar };
}

/** Error legible a partir de la respuesta. 401/403 del webhook = secreto o credencial mal: no mejora reintentando. */
function errorDe(accion, { status, cuerpo, deGoogle }) {
  const detalle = typeof cuerpo.mensaje === 'string' ? `: ${cuerpo.mensaje.slice(0, 120)}` : '';
  const quien = deGoogle ? 'Google (vía n8n)' : 'n8n';
  const reintentable = !(status === 400 || ((status === 401 || status === 403) && !deGoogle));
  return new ErrorN8n(`${quien} respondió ${status} en ${accion}${detalle}`, { status, reintentable });
}

const ok = (status) => status >= 200 && status < 300;
const noExiste = (r) => r.deGoogle && (r.status === 404 || r.status === 410);

function crearCorreoN8n({ cliente }) {
  /** Misma interfaz que adapters/correo: `mensaje` = { asunto, html, texto }. Devuelve el id del mensaje. */
  async function enviar(para, mensaje) {
    if (typeof para !== 'string' || !UN_CORREO.test(para) || para.length > 150) throw new Error('CORREO_DESTINATARIO_INVALIDO');
    const r = await cliente.enviar('correo', {
      para,
      asunto: String(mensaje.asunto).replace(/[\r\n]+/g, ' '),
      html: mensaje.html,
      texto: mensaje.texto,
    });
    if (!ok(r.status)) throw errorDe('correo', r);
    return r.cuerpo.id ? String(r.cuerpo.id) : null;
  }
  return { enviar };
}

function crearCalendarioN8n({ cliente }) {
  /** Misma interfaz que adapters/googleCalendar: crea o actualiza y devuelve el id del evento. */
  async function upsert({ cita, beneficiario, spa, appUrl, googleEventId }) {
    const evento = eventoDe({ cita, beneficiario, spa, appUrl });
    if (googleEventId && ID_EVENTO.test(googleEventId)) {
      const r = await cliente.enviar('cal_actualizar', { eventId: googleEventId, evento });
      if (ok(r.status)) return String(r.cuerpo.id || googleEventId);
      if (!noExiste(r)) throw errorDe('cal_actualizar', r); // lo borraron a mano: se crea de nuevo
    }
    const r = await cliente.enviar('cal_insertar', { evento });
    if (!ok(r.status)) throw errorDe('cal_insertar', r);
    if (!r.cuerpo.id || !ID_EVENTO.test(String(r.cuerpo.id))) throw new ErrorN8n('n8n no devolvió el id del evento', { reintentable: true });
    return String(r.cuerpo.id);
  }

  /** Si el evento ya no existe (404/410 de Google) es éxito: el resultado buscado ya se cumple. */
  async function eliminar(googleEventId) {
    if (!googleEventId || !ID_EVENTO.test(googleEventId)) return;
    const r = await cliente.enviar('cal_eliminar', { eventId: googleEventId });
    if (ok(r.status) || noExiste(r)) return;
    throw errorDe('cal_eliminar', r);
  }

  return { upsert, eliminar };
}

module.exports = { crearClienteN8n, crearCorreoN8n, crearCalendarioN8n, ErrorN8n, CABECERA };
