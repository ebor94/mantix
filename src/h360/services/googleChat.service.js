/**
 * googleChat.service.js
 * Envía mensajes a espacios de Google Chat vía webhook.
 *
 * Dos destinos independientes:
 *   REAPERTURA_WEBHOOK_URL / GOOGLE_CHAT_WEBHOOK_URL → tokens de reapertura
 *   GOOGLE_CHAT_WEBHOOK_OPERACIONES                   → avisos operativos
 *
 * Sin URL configurada no falla: registra el mensaje en el log y sigue.
 */
const https = require('https')
const { URL } = require('url')

// Se leen dentro de cada llamada, no en una constante de módulo: si este
// archivo llegara a requerirse antes de que dotenv termine, la constante
// quedaría vacía de forma permanente.
const urlReapertura  = () =>
  process.env.REAPERTURA_WEBHOOK_URL || process.env.GOOGLE_CHAT_WEBHOOK_URL || ''
const urlOperaciones = () =>
  process.env.GOOGLE_CHAT_WEBHOOK_OPERACIONES || ''

function postWebhook(webhookUrl, texto, etiqueta) {
  if (!webhookUrl) {
    console.warn(`[gchat] webhook "${etiqueta}" no configurado — mensaje NO enviado:\n`, texto)
    return Promise.resolve({ ok: false, mensaje: 'Webhook no configurado' })
  }
  const body = JSON.stringify({ text: texto })
  const u = new URL(webhookUrl)
  return new Promise((resolve) => {
    const req = https.request({
      method:   'POST',
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers:  { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let chunks = ''
      res.on('data', d => chunks += d)
      res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body: chunks }))
    })
    req.on('error', err => resolve({ ok: false, error: err.message }))
    req.write(body)
    req.end()
  })
}

/** Espacio de tokens de reapertura. */
async function enviar(texto) {
  return postWebhook(urlReapertura(), texto, 'reapertura')
}

/**
 * Espacio de avisos operativos: nuevas asistencias, exequias confirmadas y
 * servicios ofrecidos.
 *
 * Nunca lanza: un webhook caído no puede impedir que se registre una
 * asistencia o se confirme una exequia.
 */
async function enviarOperaciones(texto) {
  try {
    const r = await postWebhook(urlOperaciones(), texto, 'operaciones')
    if (!r.ok) console.warn('[gchat operaciones] no enviado:', r.error || r.status || r.mensaje)
    return r
  } catch (err) {
    console.warn('[gchat operaciones] error:', err.message)
    return { ok: false, error: err.message }
  }
}

module.exports = { enviar, enviarOperaciones }
