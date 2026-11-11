// Google Calendar (spec §10.1): cuenta de servicio con delegación de dominio, impersonando SOLO la cuenta de
// agenda configurada (MSJ_GOOGLE_IMPERSONAR) y con el scope mínimo calendar.events. El subject nunca sale de la BD
// ni de la petición. El evento es privado y no lleva celular ni cargo (minimización de datos).
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const { TZ } = require('../dominio/tiempo');
const { esc } = require('../plantillas');

/** Cliente real. Se crea solo cuando el worker lo necesita (lee la llave del disco en ese momento). */
function crearClienteGoogle({ credencialesPath, impersonar }) {
  const { JWT } = require('google-auth-library');
  const { calendar } = require('@googleapis/calendar');
  const auth = new JWT({ keyFile: credencialesPath, scopes: [SCOPE], subject: impersonar });
  return calendar({ version: 'v3', auth });
}

function eventoDe({ cita, beneficiario, spa, appUrl }) {
  const asistentes = [];
  if (beneficiario.correo) asistentes.push({ email: beneficiario.correo });
  if (spa.enEvento && spa.email) asistentes.push({ email: spa.email });
  return {
    summary: `Masaje — ${beneficiario.nombre}`,
    visibility: 'private',
    location: [spa.nombre, spa.direccion].filter(Boolean).join(' — '),
    description: [
      'Tu pausa del mes 🌿',
      '',
      `Sesión de masaje del bono mensual en ${esc(spa.nombre)}${spa.direccion ? ` (${esc(spa.direccion)})` : ''}.`,
      '',
      'Para aprovecharla al máximo:',
      '• Llega 10 minutos antes',
      '• Usa ropa cómoda',
      '• Toma agua antes y después',
      '',
      `Puedes reprogramar o cancelar hasta 24 horas antes en ${esc(appUrl)}`,
    ].join('\n'),
    start: { dateTime: cita.inicio.toISOString(), timeZone: TZ },
    end: { dateTime: cita.fin.toISOString(), timeZone: TZ },
    attendees: asistentes,
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: true },
  };
}

const esNoExiste = (err) => {
  const s = err && (err.code || (err.response && err.response.status));
  return s === 404 || s === 410;
};

function crearCalendario({ calendarId, cliente }) {
  if (!calendarId) throw new Error('GOOGLE_SIN_CALENDARIO');

  /** Crea o actualiza el evento. Devuelve el id del evento. */
  async function upsert({ cita, beneficiario, spa, appUrl, googleEventId }) {
    const requestBody = eventoDe({ cita, beneficiario, spa, appUrl });
    if (googleEventId) {
      try {
        const r = await cliente.events.patch({ calendarId, eventId: googleEventId, sendUpdates: 'all', requestBody });
        return r.data.id;
      } catch (err) {
        if (!esNoExiste(err)) throw err; // lo borraron a mano: se crea de nuevo
      }
    }
    const r = await cliente.events.insert({ calendarId, sendUpdates: 'all', requestBody });
    return r.data.id;
  }

  /** Elimina el evento. Si ya no existe (404/410) es éxito: el resultado buscado ya se cumple. */
  async function eliminar(googleEventId) {
    if (!googleEventId) return;
    try {
      await cliente.events.delete({ calendarId, eventId: googleEventId, sendUpdates: 'all' });
    } catch (err) {
      if (!esNoExiste(err)) throw err;
    }
  }

  return { upsert, eliminar };
}

module.exports = { crearCalendario, crearClienteGoogle, eventoDe, SCOPE };
