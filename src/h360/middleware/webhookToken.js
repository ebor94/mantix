/**
 * webhookToken.js — autenticación de los callbacks que entran desde n8n.
 *
 * n8n no puede mandar un JWT de usuario, así que los endpoints que llama no
 * pueden pasar por `verifyToken`. El patrón que ya existe en el repo para eso
 * —los callbacks del R-44— los deja SIN autenticación ninguna, confiando en que
 * «es IP interna»; pero la API está publicada en internet, así que esa
 * confianza no se sostiene. Este middleware es la alternativa: un secreto
 * compartido por cabecera, que es lo más que se puede pedir a un webhook que no
 * tiene usuario detrás.
 *
 * Falla CERRADO si la variable no está configurada. Es a propósito: un flujo
 * que todavía no existe no se rompe por exigirlo desde el primer día, y la
 * alternativa —dejar pasar mientras nadie configure el secreto— es justo cómo
 * un endpoint nace abierto y se queda así.
 */
const crypto = require('crypto')

/** Comparación en tiempo constante, para no filtrar el secreto por latencia. */
function igualSinFiltrarTiempo(recibido, esperado) {
  const a = Buffer.from(recibido, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  // timingSafeEqual exige la misma longitud, y la longitud en sí ya es una
  // filtración mínima e inevitable: se compara aparte y se sale temprano.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function requireWebhookToken(nombreVariable) {
  return function (req, res, next) {
    const esperado = String(process.env[nombreVariable] ?? '').trim()
    if (!esperado) {
      console.warn(`[webhook] ${nombreVariable} no está configurado: callback rechazado`)
      return res.status(503).json({
        mensaje: 'El callback no está configurado en el servidor.',
      })
    }

    const recibido = String(req.get('x-webhook-token') ?? '').trim()
    if (!recibido || !igualSinFiltrarTiempo(recibido, esperado)) {
      console.warn(`[webhook] token inválido en ${req.originalUrl}`)
      return res.status(401).json({ mensaje: 'Token de webhook inválido.' })
    }

    next()
  }
}

module.exports = { requireWebhookToken }
