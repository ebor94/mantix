// Plantillas de correo y SMS (spec §10.2–§10.3). Todo valor interpolado en HTML pasa por esc(): los nombres
// vienen de un xlsx y los motivos son texto libre. Los asuntos no admiten saltos de línea (inyección de cabeceras).
const { TZ } = require('../dominio/tiempo');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asuntoSeguro = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
const fechaLarga = (d) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d).replace(',', '');
const hora = (d) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);

function marco(titulo, cuerpo, { appUrl, conEnlace = true }) {
  return `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:16px">
<h2 style="color:#2f6b3f">${esc(titulo)}</h2>${cuerpo}
${conEnlace && /^https:\/\//.test(String(appUrl)) ? `<p><a href="${esc(appUrl)}">Ver o cambiar tu cita</a> (hasta 24 horas antes).</p>` : ''}
<hr><p style="font-size:12px;color:#6b7280">Agenda de masajes · Serfunorte Los Olivos. Mensaje automático: no respondas a este correo.</p>
</body></html>`;
}

const detalleCita = (cita, spa) => `<ul>
<li><b>Fecha:</b> ${esc(fechaLarga(cita.inicio))}</li>
<li><b>Hora:</b> ${esc(hora(cita.inicio))}</li>
<li><b>Lugar:</b> ${esc(spa.nombre)}${spa.direccion ? ` — ${esc(spa.direccion)}` : ''}</li></ul>`;

const datosPersona = (b) => `<ul>
<li><b>Nombre:</b> ${esc(b.nombre)}</li><li><b>Cargo:</b> ${esc(b.cargo || '—')}</li><li><b>Celular:</b> ${esc(b.celular || '—')}</li></ul>`;

const textoPlano = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const correo = (asunto, html) => ({ asunto: asuntoSeguro(asunto), html, texto: textoPlano(html) });

// ---- Al spa ----
const spaNueva = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Nueva cita de masaje: ${beneficiario.nombre} — ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  marco('Nueva cita agendada', `${datosPersona(beneficiario)}${detalleCita(cita, spa)}`, { appUrl, conEnlace: false }),
);
const spaReprogramada = ({ cita, antes, beneficiario, spa, appUrl }) => correo(
  `Cita reprogramada: ${beneficiario.nombre} — ahora ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  marco('Cita reprogramada', `${datosPersona(beneficiario)}<p><b>Antes:</b> ${antes ? `${esc(fechaLarga(antes))}, ${esc(hora(antes))}` : '—'}</p>
<p><b>Ahora:</b></p>${detalleCita(cita, spa)}`, { appUrl, conEnlace: false }),
);
const spaCancelada = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Cita cancelada: ${beneficiario.nombre} — ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  marco('Cita cancelada', `${datosPersona(beneficiario)}${detalleCita(cita, spa)}<p>La franja queda libre.</p>`, { appUrl, conEnlace: false }),
);

// ---- Al empleado ----
const empleadoConfirmacion = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Tu masaje quedó agendado: ${fechaLarga(cita.inicio)}, ${hora(cita.inicio)}`,
  marco(`Hola, ${beneficiario.nombre}`, `<p>Tu sesión de masaje quedó agendada:</p>${detalleCita(cita, spa)}<p>Te llegará también la invitación de Google Calendar.</p>`, { appUrl }),
);
const empleadoCancelacion = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Tu masaje del ${fechaLarga(cita.inicio)} fue cancelado`,
  marco(`Hola, ${beneficiario.nombre}`, `<p>Tu sesión fue cancelada:</p>${detalleCita(cita, spa)}<p>Si aún tienes bono este mes, puedes agendar otra franja.</p>`, { appUrl }),
);
const recordatorio2d = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Recordatorio: tu masaje es el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}`,
  marco(`Hola, ${beneficiario.nombre}`, `<p>Te recordamos tu sesión de masaje:</p>${detalleCita(cita, spa)}`, { appUrl }),
);
const esHoy = ({ cita, beneficiario, spa, appUrl }) => correo(
  `¡Es hoy! ¡Es hoy! Tu masaje es a las ${hora(cita.inicio)}`,
  marco('¡Es hoy! ¡Es hoy!', `<p>${esc(beneficiario.nombre)}, hoy es tu sesión de masaje:</p>${detalleCita(cita, spa)}`, { appUrl, conEnlace: false }),
);

// ---- SMS: ≤ 160 caracteres GSM-7, sin tildes ni ñ (evita UCS-2, que parte el mensaje en 70) ----
const SMS_MAX = 160;
const aGsm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n').replace(/[^A-Za-z0-9 .,:;!?()/@#%&*+=_-]/g, '');
const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
function recordatorioSms({ cita, spa, appUrl }) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(cita.inicio).map((x) => [x.type, x.value]));
  const dia = DIAS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
  const cuando = `${dia} ${p.day}/${p.month} a las ${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}`;
  const url = aGsm(appUrl);
  const armar = (lugar) => `Serfunorte: recuerda tu masaje el ${cuando}${lugar ? ` en ${lugar}` : ''}. Cambios hasta 24h antes en ${url}`;
  let lugar = aGsm(spa.nombre).slice(0, 40);
  let texto = armar(lugar);
  while (texto.length > SMS_MAX && lugar.length > 0) { lugar = lugar.slice(0, -1).trim(); texto = armar(lugar); }
  if (texto.length > SMS_MAX) texto = `Serfunorte: recuerda tu masaje el ${cuando}.`.slice(0, SMS_MAX);
  return texto;
}

const CORREOS = Object.freeze({
  spa_nueva: spaNueva, spa_reprogramada: spaReprogramada, spa_cancelada: spaCancelada,
  empleado_confirmacion: empleadoConfirmacion, empleado_cancelacion: empleadoCancelacion,
  recordatorio_2d: recordatorio2d, es_hoy: esHoy,
});

module.exports = { CORREOS, recordatorioSms, esc, asuntoSeguro, fechaLarga, hora, aGsm, SMS_MAX };
