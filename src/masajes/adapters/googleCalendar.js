// Google Calendar (spec §10.1): cuenta de servicio con delegación de dominio, impersonando SOLO la cuenta de
// agenda configurada (MSJ_GOOGLE_IMPERSONAR) y con el scope mínimo calendar.events. El subject nunca sale de la BD
// ni de la petición. El evento es privado y no lleva celular ni cargo (minimización de datos).
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const { TZ } = require('../dominio/tiempo');
const { esc, hora } = require('../plantillas');

const fechaConAnio = (d) => {
  const t = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1); // "Martes, 17 de noviembre de 2026"
};

/** Texto del evento (Google lo muestra con sus saltos de línea). Todo dato variable va escapado. */
function descripcionEvento({ cita, spa, appUrl }) {
  const lugar = `${esc(spa.nombre)}${spa.direccion ? ` – ${esc(spa.direccion)}` : ''}.`;
  return [
    '🌿 Un momento para tu bienestar 💆‍♀️',
    '¡Es momento de relajarte, renovar energías y disfrutar de un espacio dedicado a tu bienestar! 💚💛',
    '',
    '✨ Tu sesión de masaje está programada.',
    `📅 Fecha: ${esc(fechaConAnio(cita.inicio))}`,
    `🕗 Horario: ${esc(hora(cita.inicio))} a ${esc(hora(cita.fin))}`,
    `📍 Lugar: ${lugar}`,
    '',
    '🧖‍♀️ Recomendaciones para tu experiencia',
    'Para disfrutar de tu sesión con mayor comodidad, recuerda llevar:',
    '',
    '👨 Hombres:',
    '• Pantaloneta.',
    '• Sandalias antideslizantes.',
    '• Toalla personal.',
    '',
    '👩 Mujeres:',
    '• Traje de baño de 2 piezas.',
    '• Sandalias antideslizantes.',
    '• Toalla personal.',
    '',
    '⏰ Importante: Presentarte 10 minutos antes de la hora programada.',
    '',
    '📌 ¿Necesitas cambiar tu cita?',
    'Puedes reprogramar o cancelar tu sesión con mínimo 24 horas de anticipación, ingresando al siguiente enlace:',
    `🔗 ${esc(appUrl)}`,
    '',
    '💚 ¡Disfruta de este momento especial para ti! ✨',
  ].join('\n');
}

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
    description: descripcionEvento({ cita, spa, appUrl }),
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

module.exports = { crearCalendario, crearClienteGoogle, eventoDe, descripcionEvento, SCOPE };
