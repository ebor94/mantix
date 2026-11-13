// Plantillas de correo y SMS (spec §10.2–§10.3). Todo valor interpolado en HTML pasa por esc(): los nombres
// vienen de un xlsx y los motivos son texto libre. Los asuntos no admiten saltos de línea (inyección de cabeceras).
const { TZ } = require('../dominio/tiempo');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asuntoSeguro = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
const fechaLarga = (d) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d).replace(',', '');
const hora = (d) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);

// ---- Diseño: cabecera y pie del spa (losolivoscucuta.com/img), tablas y estilos en línea (clientes de correo) ----
const VERDE = '#1f6b35';
const VERDE_OSCURO = '#1a4a1a';
const VERDE_CLARO = '#eef6ea';
const BORDE = '#cfe3c6';
const CABECERA = 'https://losolivoscucuta.com/img/head-masaje.jpg';
const PIE = 'https://losolivoscucuta.com/img/foot-masaje.jpg';
const enlaceSeguro = (url) => (/^https:\/\//.test(String(url)) ? esc(url) : null);
const primerNombre = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';

// Una frase por cita (estable: la misma cita siempre recibe la misma en sus correos).
const FRASES = [
  'Disfruta de este espacio para relajarte, liberar tensiones y renovar tu energía.',
  'Cuidarte también es parte de hacer bien tu trabajo. ¡Disfrútalo!',
  'Una pausa a tiempo renueva el cuerpo y la mente.',
  'Gracias por todo lo que entregas cada día. Ahora te toca recibir.',
  'Tu bienestar nos importa: date este momento sin culpa.',
];
const fraseDe = (cita) => FRASES[Math.abs(Number(cita && cita.id) || 0) % FRASES.length];

const RECOMENDACIONES = [
  { titulo: 'Hombres', icono: '🩳', items: ['Pantaloneta.', 'Sandalias antideslizantes.', 'Toalla personal.'] },
  { titulo: 'Mujeres', icono: '👙', items: ['Traje de baño de 2 piezas.', 'Sandalias antideslizantes.', 'Toalla personal.'] },
];

/**
 * Marco común. `insignia` es el título (pestaña) y, con `mostrarInsignia`, la pastilla bajo la cabecera (correos al spa).
 * Con `boton` se agrega el botón a la agenda (solo si appUrl es https) y la nota de las 24 horas.
 */
function marco({ insignia, mostrarInsignia = false, saludo, intro, bloques = '', boton = null, appUrl, preencabezado = '', pie = 'Agenda de masajes · Bienestar Los Olivos.' }) {
  const url = boton ? enlaceSeguro(appUrl) : null;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(insignia)}</title>
<style>@media only screen and (max-width:480px){.col{display:block!important;width:100%!important;box-sizing:border-box;}.col-sep{border-left:0!important;border-top:1px solid ${BORDE}!important;}.pad{padding-left:14px!important;padding-right:14px!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;">${esc(preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">
  <tr><td><img src="${CABECERA}" alt="Los Olivos · Spa" width="620" style="width:100%;max-width:620px;display:block;border:none;"/></td></tr>
  ${mostrarInsignia ? `<tr><td align="center" style="padding:20px 28px 0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${VERDE};border-radius:50px;padding:10px 26px;">
      <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.5px;">${esc(insignia)}</span>
    </td></tr></table>
  </td></tr>` : ''}
  <tr><td class="pad" style="padding:20px 28px 0 28px;">
    ${saludo ? `<p style="margin:0 0 6px 0;color:${VERDE};font-size:24px;font-weight:700;">${esc(saludo)}</p>` : ''}
    <p style="margin:0;color:#444444;font-size:15px;line-height:1.55;">${intro}</p>
  </td></tr>
  ${bloques}
  ${url ? `<tr><td class="pad" align="center" style="padding:24px 28px 0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${VERDE};border-radius:50px;">
      <a href="${url}" style="display:inline-block;padding:14px 40px;color:#ffffff;font-size:17px;font-weight:700;text-decoration:none;">📅&nbsp; ${esc(boton)}</a>
    </td></tr></table>
    <p style="margin:10px 0 0 0;color:#555555;font-size:13px;">Puedes reprogramar o <strong style="color:${VERDE};">cancelar hasta 24 horas antes.</strong></p>
  </td></tr>` : ''}
  <tr><td style="padding:20px 0 0 0;"><img src="${PIE}" alt="" width="620" style="width:100%;max-width:620px;display:block;border:none;"/></td></tr>
  <tr><td style="padding:18px 28px;text-align:center;">
    <p style="margin:0;color:#bbbbbb;font-size:11px;line-height:1.5;">${esc(pie)} Correo automático: por favor no respondas a este mensaje.<br/>© Los Olivos · Cúcuta, Norte de Santander</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const fila = (etiqueta, valor) => `<tr style="border-top:1px solid #e0e0e0;">
<td style="color:#555555;font-size:13px;padding:10px 0;width:38%;vertical-align:top;">${esc(etiqueta)}</td>
<td style="color:#1a4a1a;font-size:14px;font-weight:700;padding:10px 0;">${valor}</td></tr>`;
const tabla = (filas) => `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table></td></tr>`;

const lugarDe = (spa) => `${esc(spa.nombre)}${spa.direccion ? `<br/><span style="font-weight:400;color:#555555;">${esc(spa.direccion)}</span>` : ''}`;
// Ficha en filas (correos al spa).
const detalleCita = (cita, spa) => tabla(
  fila('Fecha', esc(fechaLarga(cita.inicio))) + fila('Hora', esc(hora(cita.inicio))) + fila('Lugar', lugarDe(spa)),
);
const datosPersona = (b) => fila('Nombre', esc(b.nombre)) + fila('Cargo', esc(b.cargo || '—')) + fila('Celular', esc(b.celular || '—'));

const recuadro = (titulo, contenido, { fondo = '#f9fbe7', borde = '#2d7d2d', color = '#1a4a1a' } = {}) => `<tr><td style="padding:18px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${fondo};border-left:4px solid ${borde};border-radius:0 8px 8px 0;">
<tr><td style="padding:14px 20px;color:${color};font-size:14px;line-height:1.6;">${titulo ? `<strong>${esc(titulo)}</strong><br/>` : ''}${contenido}</td></tr></table></td></tr>`;

// ---- Bloques del correo al empleado (diseño de la tarjeta del spa) ----
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const celdaDato = (icono, etiqueta, valor, separador) => `<td width="33%" valign="top" class="col${separador ? ' col-sep' : ''}" style="padding:14px 10px;${separador ? `border-left:1px solid ${BORDE};` : ''}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="top" style="font-size:26px;line-height:1;padding:2px 8px 0 0;">${icono}</td>
<td valign="top" style="color:#444444;font-size:13px;line-height:1.35;">${esc(etiqueta)}<br/><strong style="color:${VERDE_OSCURO};font-size:15px;">${valor}</strong></td>
</tr></table></td>`;
// Fecha, hora y lugar en una franja de tres columnas.
function tarjetaCita(cita, spa) {
  const [dia, ...resto] = fechaLarga(cita.inicio).split(' ');
  const lugar = `${esc(spa.nombre)}${spa.direccion ? `</strong><br/><span style="color:#555555;font-size:13px;">${esc(spa.direccion)}</span><strong>` : ''}`;
  return `<tr><td class="pad" style="padding:18px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${VERDE_CLARO};border:1px solid ${BORDE};border-radius:12px;"><tr>
${celdaDato('📅', 'Fecha:', `${esc(mayuscula(dia))}<br/>${esc(resto.join(' '))}`, false)}
${celdaDato('🕗', 'Hora:', esc(hora(cita.inicio)), true)}
${celdaDato('📍', 'Lugar:', lugar, true)}
</tr></table></td></tr>`;
}
const fraseEmpleado = (cita) => `<tr><td class="pad" style="padding:16px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7fbf4;border:1px solid ${BORDE};border-radius:14px;"><tr>
<td width="40" align="center" style="font-size:26px;padding:12px 0 12px 12px;">🌿</td>
<td align="center" style="padding:12px 10px;color:${VERDE};font-size:17px;font-style:italic;font-weight:600;line-height:1.45;">${esc(fraseDe(cita))}</td>
<td width="40" align="center" style="font-size:26px;padding:12px 12px 12px 0;">🌿</td>
</tr></table></td></tr>`;
const columnaRecomendacion = ({ titulo, icono, items }, separador) => `<td width="50%" valign="top" class="col${separador ? ' col-sep' : ''}" style="padding:14px 12px;${separador ? `border-left:1px solid ${BORDE};` : ''}">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="font-size:44px;line-height:1;padding:0 10px 0 0;">${icono}</td>
<td valign="top"><span style="display:inline-block;background-color:${VERDE_CLARO};border-radius:6px;padding:3px 12px;color:${VERDE};font-size:15px;font-weight:700;">${esc(titulo)}:</span>
<div style="margin-top:6px;color:#333333;font-size:14px;line-height:1.6;">${items.map((i) => `•&nbsp; ${esc(i)}`).join('<br/>')}</div></td>
</tr></table></td>`;
const recomendaciones = () => `<tr><td class="pad" style="padding:18px 28px 0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDE};border-radius:12px;overflow:hidden;">
<tr><td colspan="2" class="col" style="background-color:${VERDE};padding:10px 16px;color:#ffffff;font-size:17px;font-weight:700;">📋&nbsp; Recomendaciones para tu cita:</td></tr>
<tr>${RECOMENDACIONES.map((r, i) => columnaRecomendacion(r, i > 0)).join('')}</tr>
</table></td></tr>`;
const importante = () => `<tr><td class="pad" align="center" style="padding:16px 28px 0 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${VERDE_CLARO};border-radius:50px;"><tr>
<td style="padding:9px 22px;color:#333333;font-size:14px;">⏰&nbsp; <strong style="color:${VERDE};">Importante:</strong> Llega 10 minutos antes de la hora programada.</td>
</tr></table></td></tr>`;
const cuerpoEmpleado = (cita, spa) => tarjetaCita(cita, spa) + fraseEmpleado(cita) + recomendaciones() + importante();

const textoPlano = (html) => html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/, '').replace(/<br\s*\/?>/g, '\n').replace(/<\/(tr|p)>/g, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const correo = (asunto, html) => ({ asunto: asuntoSeguro(asunto), html, texto: textoPlano(html) });

// ---- Al spa (ficha de trabajo, sin enlace a la agenda) ----
const alSpa = (insignia, intro, b, extra, cita, spa) => marco({
  insignia, mostrarInsignia: true, intro, preencabezado: `${b.nombre} · ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  bloques: tabla(datosPersona(b)) + extra, pie: 'Agenda de masajes · Bienestar Los Olivos.',
});
const spaNueva = ({ cita, beneficiario, spa }) => correo(
  `Nueva cita de masaje: ${beneficiario.nombre} — ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  alSpa('Nueva cita agendada', 'Se agendó una nueva sesión de masaje:', beneficiario, detalleCita(cita, spa), cita, spa),
);
const spaReprogramada = ({ cita, antes, beneficiario, spa }) => correo(
  `Cita reprogramada: ${beneficiario.nombre} — ahora ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  alSpa('Cita reprogramada', 'Una sesión cambió de horario:', beneficiario,
    recuadro('Antes', antes ? `${esc(fechaLarga(antes))}, ${esc(hora(antes))}` : '—', { fondo: '#fff8e1', borde: '#f0a500', color: '#7f4f00' })
    + recuadro('Ahora', `${esc(fechaLarga(cita.inicio))}, ${esc(hora(cita.inicio))}`) + detalleCita(cita, spa), cita, spa),
);
const spaCancelada = ({ cita, beneficiario, spa }) => correo(
  `Cita cancelada: ${beneficiario.nombre} — ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
  alSpa('Cita cancelada', 'Se canceló esta sesión. La franja queda libre.', beneficiario, detalleCita(cita, spa), cita, spa),
);

// ---- Al empleado (mensaje cálido y motivador) ----
const empleadoConfirmacion = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Tu masaje quedó agendado: ${fechaLarga(cita.inicio)}, ${hora(cita.inicio)}`,
  marco({
    insignia: 'Tu masaje está agendado', saludo: `¡Hola, ${primerNombre(beneficiario.nombre)}!`, appUrl, boton: 'Ver o cambiar mi cita',
    preencabezado: `Te esperamos el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}.`,
    intro: 'Tu sesión de masaje ya está reservada. También recibirás la invitación en tu calendario.',
    bloques: cuerpoEmpleado(cita, spa),
  }),
);
const empleadoCancelacion = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Tu masaje del ${fechaLarga(cita.inicio)} fue cancelado`,
  marco({
    insignia: 'Cita cancelada', saludo: `Hola, ${primerNombre(beneficiario.nombre)}`, appUrl, boton: 'Agendar otra fecha',
    preencabezado: 'Si aún tienes tu bono de este mes, puedes elegir otra franja.',
    intro: 'Tu sesión de masaje fue cancelada. Si aún tienes tu bono de este mes, puedes agendar otra franja: tu bienestar sigue siendo una prioridad.',
    bloques: tarjetaCita(cita, spa),
  }),
);
const recordatorio2d = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Recordatorio: tu masaje es el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}`,
  marco({
    insignia: 'Faltan 2 días para tu pausa', saludo: `¡Hola, ${primerNombre(beneficiario.nombre)}!`, appUrl, boton: 'Ver o cambiar mi cita',
    preencabezado: `Tu masaje es el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}.`,
    intro: 'Se acerca tu momento de descanso. Reserva ese tiempo en tu agenda: es tuyo.',
    bloques: cuerpoEmpleado(cita, spa),
  }),
);
const esHoy = ({ cita, beneficiario, spa, appUrl }) => correo(
  `¡Es hoy! ¡Es hoy! Tu masaje es a las ${hora(cita.inicio)}`,
  marco({
    insignia: '¡Es hoy! ¡Es hoy!', saludo: `${primerNombre(beneficiario.nombre)}, hoy te toca a ti`, appUrl,
    preencabezado: `Tu masaje es hoy a las ${hora(cita.inicio)}.`,
    intro: 'Hoy es tu sesión de masaje. Deja por un rato los pendientes y regálate este espacio.',
    bloques: cuerpoEmpleado(cita, spa),
  }),
);

// ---- SMS: ≤ 160 caracteres GSM-7, sin tildes ni ñ (evita UCS-2, que parte el mensaje en 70) ----
const SMS_MAX = 160;
const aGsm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/gi, 'n').replace(/[^A-Za-z0-9 .,:;!?()/@#%&*+=_-]/g, '');
const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
function partesSms(inicio) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true })
    .formatToParts(inicio).map((x) => [x.type, x.value]));
  const dia = DIAS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
  return { fecha: `${dia} ${p.day}/${p.month}`, hora: `${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}` };
}

/**
 * Arma el SMS dentro de 160 caracteres GSM-7: `armar(lugar)` da el texto completo; si no cabe, primero recorta
 * el nombre del spa y, si aun así no cabe, usa `corto` (sin lugar ni enlace).
 */
function smsAjustado({ spa }, armar, corto) {
  let lugar = aGsm(spa.nombre).slice(0, 40);
  let texto = armar(lugar);
  while (texto.length > SMS_MAX && lugar.length > 0) { lugar = lugar.slice(0, -1).trim(); texto = armar(lugar); }
  return texto.length <= SMS_MAX ? texto : corto.slice(0, SMS_MAX);
}
const en = (lugar) => (lugar ? ` en ${lugar}` : '');

// Recordatorio 2 días antes.
function recordatorioSms(datos) {
  const { fecha, hora: h } = partesSms(datos.cita.inicio);
  const url = aGsm(datos.appUrl);
  return smsAjustado(datos, (l) => `Los Olivos: tu masaje es el ${fecha} a las ${h}${en(l)}. Regalate este momento! Cambios 24h antes: ${url}`,
    `Los Olivos: tu masaje es el ${fecha} a las ${h}. Regalate este momento!`);
}
// Al agendar ("Tu momento de bienestar esta confirmado!").
function confirmacionSms(datos) {
  const { fecha, hora: h } = partesSms(datos.cita.inicio);
  const url = aGsm(datos.appUrl);
  return smsAjustado(datos, (l) => `Los Olivos: Tu momento de bienestar esta confirmado! Masaje ${fecha} ${h}${en(l)}. Cambios 24h antes: ${url}`,
    `Los Olivos: Tu momento de bienestar esta confirmado! Masaje ${fecha} ${h}. Te esperamos!`);
}
// Al reprogramar: el worker pasa `antes` (inicio anterior) cuando la cita viene de una reprogramación.
function reprogramacionSms(datos) {
  const { fecha, hora: h } = partesSms(datos.cita.inicio);
  const url = aGsm(datos.appUrl);
  return smsAjustado(datos, (l) => `Los Olivos: Tu cita fue reprogramada! Masaje ${fecha} ${h}${en(l)}. Te esperamos! Cambios 24h antes: ${url}`,
    `Los Olivos: Tu cita fue reprogramada! Masaje ${fecha} ${h}. Te esperamos!`);
}

/** SMS por tipo de aviso (el worker elige con n.tipo). */
const SMS = Object.freeze({
  recordatorio_2d: recordatorioSms,
  empleado_confirmacion: (datos) => (datos.antes ? reprogramacionSms(datos) : confirmacionSms(datos)),
});

const CORREOS = Object.freeze({
  spa_nueva: spaNueva, spa_reprogramada: spaReprogramada, spa_cancelada: spaCancelada,
  empleado_confirmacion: empleadoConfirmacion, empleado_cancelacion: empleadoCancelacion,
  recordatorio_2d: recordatorio2d, es_hoy: esHoy,
});

module.exports = { CORREOS, SMS, recordatorioSms, confirmacionSms, reprogramacionSms, esc, asuntoSeguro, fechaLarga, hora, aGsm, SMS_MAX };
