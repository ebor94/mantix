// Canal del correo de confirmación. Nunca lanza: un fallo del correo no puede impedir una inscripción.
const axios = require('axios');

const SIN_ENVIO = { enviado: false, error: null };

function crearNotificador(correo, http = axios) {
  if (correo.canal !== 'n8n') return { async notificar() { return SIN_ENVIO; } };
  return {
    async notificar(datos) {
      try {
        await http.post(correo.url, datos, { headers: { 'X-Duelo-Secreto': correo.secreto }, timeout: 8000 });
        return { enviado: true, error: null };
      } catch (err) {
        return { enviado: false, error: String((err && err.message) || 'error').slice(0, 255) };
      }
    },
  };
}

module.exports = { crearNotificador };
