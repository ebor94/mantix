/**
 * googleChat.service.js
 * Envía mensajes al webhook del espacio de Google Chat configurado.
 * URL en env GOOGLE_CHAT_WEBHOOK_URL (o REAPERTURA_WEBHOOK_URL). Sin URL, log-only.
 */
const https = require('https')
const { URL } = require('url')

const WEBHOOK_URL = process.env.REAPERTURA_WEBHOOK_URL
  || process.env.GOOGLE_CHAT_WEBHOOK_URL
  || ''

async function enviar(texto) {
  if (!WEBHOOK_URL) {
    console.warn('[gchat] REAPERTURA_WEBHOOK_URL no configurado — mensaje NO enviado:\n', texto)
    return { ok: false, mensaje: 'Webhook no configurado' }
  }
  const body = JSON.stringify({ text: texto })
  const u = new URL(WEBHOOK_URL)
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

module.exports = { enviar }
