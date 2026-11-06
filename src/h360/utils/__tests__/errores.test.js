// malUso es lo que separa «la persona mandó algo inválido» (400, con el mensaje
// para ella) de «el servidor falló» (500, genérico). Si pierde el status, cada
// validación del módulo se convierte en un 500 sin decir qué estaba mal.

const { malUso } = require('../errores')

describe('malUso', () => {
  test('devuelve un Error; no lo lanza (quien llama escribe throw malUso(...))', () => {
    let e
    expect(() => { e = malUso('el dato no sirve') }).not.toThrow()
    expect(e).toBeInstanceOf(Error)
  })

  // El controlador responde 400 solo si ve err.status === 400.
  test('lleva status 400', () => {
    expect(malUso('el dato no sirve').status).toBe(400)
  })

  test('conserva el mensaje tal cual, sin prefijos ni recortes', () => {
    const mensaje = 'buscarOrdenes: "contrato" es demasiado largo: admite como máximo 20 caracteres'
    expect(malUso(mensaje).message).toBe(mensaje)
  })

  test('cada llamada devuelve un error propio, no uno compartido', () => {
    const a = malUso('uno')
    const b = malUso('dos')
    expect(a).not.toBe(b)
    expect(a.message).toBe('uno')
    expect(b.message).toBe('dos')
  })

  // Con throw se ve en el log de dónde salió: sin pila, el 400 sería un misterio.
  test('trae pila, como cualquier Error', () => {
    expect(typeof malUso('x').stack).toBe('string')
  })
})
