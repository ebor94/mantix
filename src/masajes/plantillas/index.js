// Plantillas de correo y SMS (spec §10.2–§10.3). Todo valor interpolado en HTML pasa por esc(): los nombres
// vienen de un xlsx y los motivos son texto libre. Los asuntos no admiten saltos de línea (inyección de cabeceras).
const { TZ } = require('../dominio/tiempo');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const asuntoSeguro = (s) => String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
const fechaLarga = (d) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d).replace(',', '');
const hora = (d) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);

// ---- Diseño (mismo estilo que los correos de H360: cabecera y pie de losolivoscucuta.com, tablas e estilos en línea) ----
const VERDE = '#1a7a45';
const CABECERA = 'https://losolivoscucuta.com/difusiones/img/cabecera%20olivos.png';
const PIE = 'https://losolivoscucuta.com/difusiones/img/pie%20de%20pagina.png';
const enlaceSeguro = (url) => (/^https:\/\//.test(String(url)) ? esc(url) : null);
const primerNombre = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';

// Una frase por cita (estable: la misma cita siempre recibe la misma en sus correos).
const FRASES = [
  'Este espacio es para ti: respira, suelta y recarga energía.',
  'Cuidarte también es parte de hacer bien tu trabajo. ¡Disfrútalo!',
  'Una pausa a tiempo renueva el cuerpo y la mente.',
  'Gracias por todo lo que entregas cada día. Ahora te toca recibir.',
  'Tu bienestar nos importa: date este momento sin culpa.',
];
const fraseDe = (cita) => FRASES[Math.abs(Number(cita && cita.id) || 0) % FRASES.length];

const CONSEJOS = ['Llega 10 minutos antes para empezar con calma.', 'Usa ropa cómoda.', 'Toma agua antes y después de la sesión.'];

function marco({ insignia, saludo, intro, bloques = '', boton = null, appUrl, preencabezado = '', pie = 'Agenda de masajes · Bienestar Los Olivos.' }) {
  const url = boton ? enlaceSeguro(appUrl) : null;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(insignia)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f4;">${esc(preencabezado)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">
  <tr><td><img src="${CABECERA}" alt="Los Olivos" width="620" style="width:100%;max-width:620px;display:block;border:none;"/></td></tr>
  <tr><td align="center" style="padding:28px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${VERDE};border-radius:50px;padding:10px 26px;">
      <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.5px;">${esc(insignia)}</span>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:24px 32px 0 32px;">
    ${saludo ? `<p style="margin:0 0 10px 0;color:#1a4a1a;font-size:20px;font-weight:700;">${esc(saludo)}</p>` : ''}
    <p style="margin:0;color:#555555;font-size:15px;line-height:1.6;">${intro}</p>
  </td></tr>
  ${bloques}
  ${url ? `<tr><td align="center" style="padding:26px 32px 0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:${VERDE};border-radius:6px;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${esc(boton)}</a>
    </td></tr></table>
    <p style="margin:8px 0 0 0;color:#888888;font-size:12px;">Puedes reprogramar o cancelar hasta 24 horas antes.</p>
  </td></tr>` : ''}
  <tr><td style="padding:28px 32px 0 32px;"></td></tr>
  <tr><td><img src="${PIE}" alt="Los Olivos" width="620" style="width:100%;max-width:620px;display:block;border:none;"/></td></tr>
  <tr><td style="padding:18px 32px;text-align:center;">
    <p style="margin:0;color:#bbbbbb;font-size:11px;line-height:1.5;">${esc(pie)} Correo automático: por favor no respondas a este mensaje.<br/>© Los Olivos · Cúcuta, Norte de Santander</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

const fila = (etiqueta, valor) => `<tr style="border-top:1px solid #e0e0e0;">
<td style="color:#555555;font-size:13px;padding:10px 0;width:38%;vertical-align:top;">${esc(etiqueta)}</td>
<td style="color:#1a4a1a;font-size:14px;font-weight:700;padding:10px 0;">${valor}</td></tr>`;
const tabla = (filas) => `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table></td></tr>`;

const lugarDe = (spa) => `${esc(spa.nombre)}${spa.direccion ? `<br/><span style="font-weight:400;color:#555555;">${esc(spa.direccion)}</span>` : ''}`;
const detalleCita = (cita, spa) => tabla(
  fila('Fecha', esc(fechaLarga(cita.inicio))) + fila('Hora', esc(hora(cita.inicio))) + fila('Lugar', lugarDe(spa)),
);
const datosPersona = (b) => fila('Nombre', esc(b.nombre)) + fila('Cargo', esc(b.cargo || '—')) + fila('Celular', esc(b.celular || '—'));

const recuadro = (titulo, contenido, { fondo = '#f9fbe7', borde = '#2d7d2d', color = '#1a4a1a' } = {}) => `<tr><td style="padding:18px 32px 0 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${fondo};border-left:4px solid ${borde};border-radius:0 8px 8px 0;">
<tr><td style="padding:14px 20px;color:${color};font-size:14px;line-height:1.6;">${titulo ? `<strong>${esc(titulo)}</strong><br/>` : ''}${contenido}</td></tr></table></td></tr>`;
const frase = (cita) => recuadro('', `<em>${esc(fraseDe(cita))}</em>`);
const consejos = () => recuadro('Para aprovecharla al máximo', CONSEJOS.map((c) => `• ${esc(c)}`).join('<br/>'));

const textoPlano = (html) => html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<div style="display:none[^>]*>[\s\S]*?<\/div>/, '').replace(/<br\s*\/?>/g, '\n').replace(/<\/(tr|p)>/g, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
const correo = (asunto, html) => ({ asunto: asuntoSeguro(asunto), html, texto: textoPlano(html) });

// ---- Al spa (ficha de trabajo, sin enlace a la agenda) ----
const alSpa = (insignia, intro, b, extra, cita, spa) => marco({
  insignia, intro, preencabezado: `${b.nombre} · ${fechaLarga(cita.inicio)} ${hora(cita.inicio)}`,
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
    intro: 'Tu sesión de masaje del bono de este mes ya está reservada. Te llegará también la invitación a tu calendario.',
    bloques: detalleCita(cita, spa) + frase(cita) + consejos(),
  }),
);
const empleadoCancelacion = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Tu masaje del ${fechaLarga(cita.inicio)} fue cancelado`,
  marco({
    insignia: 'Cita cancelada', saludo: `Hola, ${primerNombre(beneficiario.nombre)}`, appUrl, boton: 'Agendar otra fecha',
    preencabezado: 'Si aún tienes tu bono de este mes, puedes elegir otra franja.',
    intro: 'Tu sesión de masaje fue cancelada. Si aún tienes tu bono de este mes, puedes agendar otra franja: tu bienestar sigue siendo una prioridad.',
    bloques: detalleCita(cita, spa),
  }),
);
const recordatorio2d = ({ cita, beneficiario, spa, appUrl }) => correo(
  `Recordatorio: tu masaje es el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}`,
  marco({
    insignia: 'Faltan 2 días para tu pausa', saludo: `¡Hola, ${primerNombre(beneficiario.nombre)}!`, appUrl, boton: 'Ver o cambiar mi cita',
    preencabezado: `Tu masaje es el ${fechaLarga(cita.inicio)} a las ${hora(cita.inicio)}.`,
    intro: 'Se acerca tu momento de descanso. Reserva ese tiempo en tu agenda: es tuyo.',
    bloques: detalleCita(cita, spa) + frase(cita) + consejos(),
  }),
);
const esHoy = ({ cita, beneficiario, spa, appUrl }) => correo(
  `¡Es hoy! ¡Es hoy! Tu masaje es a las ${hora(cita.inicio)}`,
  marco({
    insignia: '¡Es hoy! ¡Es hoy!', saludo: `${primerNombre(beneficiario.nombre)}, hoy te toca a ti`, appUrl,
    preencabezado: `Tu masaje es hoy a las ${hora(cita.inicio)}.`,
    intro: 'Hoy es tu sesión de masaje. Deja por un rato los pendientes y regálate este espacio.',
    bloques: detalleCita(cita, spa) + frase(cita) + consejos(),
  }),
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
  const armar = (lugar) => `Los Olivos: tu masaje es el ${cuando}${lugar ? ` en ${lugar}` : ''}. Regalate este momento! Cambios 24h antes: ${url}`;
  let lugar = aGsm(spa.nombre).slice(0, 40);
  let texto = armar(lugar);
  while (texto.length > SMS_MAX && lugar.length > 0) { lugar = lugar.slice(0, -1).trim(); texto = armar(lugar); }
  if (texto.length > SMS_MAX) texto = `Los Olivos: tu masaje es el ${cuando}. Regalate este momento!`.slice(0, SMS_MAX);
  return texto;
}

const CORREOS = Object.freeze({
  spa_nueva: spaNueva, spa_reprogramada: spaReprogramada, spa_cancelada: spaCancelada,
  empleado_confirmacion: empleadoConfirmacion, empleado_cancelacion: empleadoCancelacion,
  recordatorio_2d: recordatorio2d, es_hoy: esHoy,
});

module.exports = { CORREOS, recordatorioSms, esc, asuntoSeguro, fechaLarga, hora, aGsm, SMS_MAX };
