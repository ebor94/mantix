const DueloError = require('../utils/DueloError');

const URL_VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MENSAJE = 'No pudimos verificar que eres una persona. Inténtalo de nuevo.';

/** Si DUELO_TURNSTILE_SECRET está definido exige un token válido; si no, no hace nada. */
function crearTurnstile(obtenerConfig, http) {
  return async function verificar(req) {
    const secreto = obtenerConfig().turnstileSecret;
    if (!secreto) return;
    let valido = false;
    try {
      const cuerpo = new URLSearchParams({ secret: secreto, response: String(req.body.turnstile_token || '') });
      const r = await http.post(URL_VERIFICAR, cuerpo, { timeout: 8000 });
      valido = Boolean(r.data && r.data.success);
    } catch {
      valido = false;
    }
    if (!valido) throw new DueloError(422, 'VALIDACION', MENSAJE, { turnstile: MENSAJE });
  };
}

module.exports = { crearTurnstile };
