// La autenticación de los callbacks de n8n.
//
// Existe porque el patrón que ya hay en el repo (los callbacks del R-44) deja
// esos endpoints sin autenticación ninguna, confiando en que solo se alcanzan
// desde la LAN — y la API está publicada en internet.

const { requireWebhookToken } = require('../webhookToken')

function reqFalso(token, url = '/api/h360/desinfecciones/evidencia/drive') {
  return {
    originalUrl: url,
    get: (h) => (h.toLowerCase() === 'x-webhook-token' ? token : undefined),
  }
}

function resFalso() {
  return {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  }
}

const VARIABLE = 'PRUEBA_WEBHOOK_TOKEN'
let avisos

beforeEach(() => {
  delete process.env[VARIABLE]
  avisos = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { avisos.mockRestore(); delete process.env[VARIABLE] })

describe('requireWebhookToken', () => {
  // Lo importante de este archivo: sin secreto configurado NO pasa nada. Si
  // dejara pasar, el endpoint nacería abierto y se quedaría así.
  test('sin la variable configurada rechaza con 503', () => {
    const next = jest.fn()
    const res = resFalso()
    requireWebhookToken(VARIABLE)(reqFalso('cualquiera'), res, next)

    expect(res.codigo).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  test('con el token correcto deja pasar', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const next = jest.fn()
    const res = resFalso()
    requireWebhookToken(VARIABLE)(reqFalso('secreto-de-prueba'), res, next)

    expect(next).toHaveBeenCalled()
    expect(res.codigo).toBe(200)
  })

  test('con token distinto da 401', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const next = jest.fn()
    const res = resFalso()
    requireWebhookToken(VARIABLE)(reqFalso('otro'), res, next)

    expect(res.codigo).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  test('sin cabecera da 401', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const next = jest.fn()
    const res = resFalso()
    requireWebhookToken(VARIABLE)(reqFalso(undefined), res, next)

    expect(res.codigo).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  // Un prefijo correcto no debe pasar: es el error clásico de comparar con
  // startsWith o con una longitud mal puesta.
  test('un prefijo del token no pasa', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const next = jest.fn()
    requireWebhookToken(VARIABLE)(reqFalso('secreto'), resFalso(), next)

    expect(next).not.toHaveBeenCalled()
  })

  test('el token se recorta antes de comparar', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const next = jest.fn()
    requireWebhookToken(VARIABLE)(reqFalso('  secreto-de-prueba  '), resFalso(), next)

    expect(next).toHaveBeenCalled()
  })

  test('no devuelve el token esperado en el mensaje de error', () => {
    process.env[VARIABLE] = 'secreto-de-prueba'
    const res = resFalso()
    requireWebhookToken(VARIABLE)(reqFalso('otro'), res, jest.fn())

    expect(JSON.stringify(res.cuerpo)).not.toContain('secreto-de-prueba')
  })
})
