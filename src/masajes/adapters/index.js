// Adaptadores reales a partir de leerIntegraciones().config. Se arman la primera vez que el worker los necesita.
// Con integ.n8n, correo y calendario salen por el webhook de n8n (flujo "Masajes — avisos"); si no, directo.
const { crearCalendario, crearClienteGoogle } = require('./googleCalendar');
const { crearCorreo, crearTransporteMantix } = require('./correo');
const { crearClienteHablame } = require('./hablameSms');
const { crearClienteN8n, crearCorreoN8n, crearCalendarioN8n } = require('./n8n');

function crearAdaptadoresReales(integ, env = process.env) {
  const sms = crearClienteHablame({ url: integ.hablame.url, apiKey: integ.hablame.apiKey });
  if (integ.n8n) {
    const cliente = crearClienteN8n(integ.n8n);
    return { calendario: crearCalendarioN8n({ cliente }), correo: crearCorreoN8n({ cliente }), sms };
  }
  return {
    calendario: crearCalendario({ calendarId: integ.google.calendarId, cliente: crearClienteGoogle(integ.google) }),
    correo: crearCorreo({ transporte: crearTransporteMantix(env), remitente: env.MSJ_EMAIL_FROM || env.EMAIL_FROM }),
    sms,
  };
}

module.exports = { crearAdaptadoresReales };
