// Adaptadores reales a partir de leerIntegraciones().config. Se arman la primera vez que el worker los necesita.
const { crearCalendario, crearClienteGoogle } = require('./googleCalendar');
const { crearCorreo, crearTransporteMantix } = require('./correo');
const { crearClienteHablame } = require('./hablameSms');

function crearAdaptadoresReales(integ, env = process.env) {
  return {
    calendario: crearCalendario({ calendarId: integ.google.calendarId, cliente: crearClienteGoogle(integ.google) }),
    correo: crearCorreo({ transporte: crearTransporteMantix(env), remitente: env.MSJ_EMAIL_FROM || env.EMAIL_FROM }),
    sms: crearClienteHablame({ url: integ.hablame.url, apiKey: integ.hablame.apiKey }),
  };
}

module.exports = { crearAdaptadoresReales };
