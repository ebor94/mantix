// Lo que los dos controladores del R-56 leen de una petición. Vive en un solo
// archivo porque son dos controladores hermanos sobre las mismas tablas: con una
// copia en cada uno, el mismo caso se respondía 403 con mensaje en uno y 500 mudo
// en el otro. Acá se fija el criterio; que cada controlador lo use está en sus
// propias pruebas (duelo.gestion.test.js y duelo.atenciones.test.js).

const { eco, usuarioDelLogin, sinUsuario, leerId, leerIdDeCuerpo, responderError } =
  require('../duelo.peticion')
const { malUso, noEncontrado } = require('../errores')

describe('usuarioDelLogin', () => {
  // De acá salen `psicologa` y `created_by`, que son NOT NULL y son toda la
  // auditoría del módulo: en el Excel ese nombre se escribía a mano.
  test('devuelve el usuario recortado', () => {
    expect(usuarioDelLogin({ user: { usuario: 'JAZMIN' } })).toBe('JAZMIN')
    expect(usuarioDelLogin({ user: { usuario: ' JAZMIN ' } })).toBe('JAZMIN')
    expect(usuarioDelLogin({ user: { usuario: '\tJAZMIN\n' } })).toBe('JAZMIN')
  })

  // Un texto en blanco cumpliría el NOT NULL y dejaría la fila sin responsable:
  // no es un usuario.
  test.each([
    ['sin petición',            undefined],
    ['sin req.user',            {}],
    ['req.user null',           { user: null }],
    ['sin usuario',             { user: { rol: 'psicologia' } }],
    ['usuario vacío',           { user: { usuario: '' } }],
    ['usuario en blanco',       { user: { usuario: '   ' } }],
    ['usuario numérico',        { user: { usuario: 42 } }],
    ['usuario objeto',          { user: { usuario: { nombre: 'ANA' } } }],
    ['usuario lista',           { user: { usuario: ['ANA'] } }],
  ])('%s: no hay usuario', (_caso, req) => {
    expect(usuarioDelLogin(req)).toBeNull()
  })
})

describe('sinUsuario', () => {
  test('es un 403 que explica la causa y qué hacer', () => {
    const res = { codigo: null, cuerpo: null }
    res.status = c => { res.codigo = c; return res }
    res.json = b => { res.cuerpo = b; return res }
    sinUsuario(res)
    expect(res.codigo).toBe(403)
    expect(res.cuerpo.mensaje).toMatch(/usuario/)
    expect(res.cuerpo.mensaje).toMatch(/sesión/i)
  })
})

describe('leerId', () => {
  test('un id de solo dígitos pasa, recortado y como texto', () => {
    expect(leerId('5')).toBe('5')
    expect(leerId(' 42 ')).toBe('42')
    expect(leerId('0')).toBe('0')
  })

  // Un id no numérico entraba al SQL tal cual: en una escritura MySQL corta la
  // sentencia (500 mudo) y en una lectura no coincide con nada, que es peor
  // porque la respuesta vacía se lee como «esta familia no tiene nada».
  test.each([
    'abc', '', '   ', '5a', 'a5', '-1', '+1', '1.5', '1e3', '5 OR 1=1', '5;DROP',
    '٥', 'null', undefined, null, 7, 7.5, ['5'], { id: 5 },
  ])('%p es 400 con mensaje', valor => {
    let e
    try { leerId(valor) } catch (err) { e = err }
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(400)
    expect(e.message).toMatch(/gesti[óo]n/i)
  })

  // El mensaje cita lo que llegó, acotado: el id viene de la URL y puede ser
  // cualquier cosa.
  test('el mensaje cita lo que llegó sin repetirlo entero', () => {
    try { leerId('X'.repeat(500)) } catch (e) {
      expect(e.message).toContain('…')
      expect(e.message.length).toBeLessThan(200)
    }
    expect.hasAssertions()
  })
})

// Un id que viaja en el CUERPO (`asistencia_id`), no en la ruta. Difiere de
// leerId en dos cosas que importan: el JSON trae el número como número (77, no
// '77'), y null es un valor válido porque es cómo se desvincula.
describe('leerIdDeCuerpo', () => {
  test('un número entero o un texto de solo dígitos pasan; el texto, recortado', () => {
    expect(leerIdDeCuerpo(77, 'asistencia_id')).toBe(77)
    expect(leerIdDeCuerpo('77', 'asistencia_id')).toBe('77')
    expect(leerIdDeCuerpo(' 77 ', 'asistencia_id')).toBe('77')
    expect(leerIdDeCuerpo(0, 'asistencia_id')).toBe(0)
  })

  test('null pasa: es cómo se desvincula la asistencia', () => {
    expect(leerIdDeCuerpo(null, 'asistencia_id')).toBeNull()
  })

  // La columna es INT UNSIGNED: 4294967295 es lo más grande que cabe, y un valor
  // mayor es ER_WARN_DATA_OUT_OF_RANGE en modo estricto, otro 500 mudo.
  test('el tope de la columna (4294967295) cabe; un número más no', () => {
    expect(leerIdDeCuerpo(4294967295, 'asistencia_id')).toBe(4294967295)
    expect(leerIdDeCuerpo('4294967295', 'asistencia_id')).toBe('4294967295')
    expect(() => leerIdDeCuerpo(4294967296, 'asistencia_id')).toThrow(/asistencia_id/)
    expect(() => leerIdDeCuerpo('4294967296', 'asistencia_id')).toThrow(/asistencia_id/)
  })

  test.each([
    'abc', '', '   ', '5a', 'a5', '-1', '+1', '1.5', '1e3', '5 OR 1=1', '٥', 'null',
    '9'.repeat(500),
    -1, 1.5, NaN, Infinity, 1e21, true, false, undefined, [], [77], {}, { id: 77 },
  ])('%p es 400 con mensaje que nombra el campo', valor => {
    let e
    try { leerIdDeCuerpo(valor, 'asistencia_id') } catch (err) { e = err }
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(400)
    expect(e.message).toMatch(/asistencia_id/)
  })

  // Es un identificador, no contenido de una familia: citarlo ayuda a depurar.
  test('el mensaje cita lo que llegó sin repetirlo entero', () => {
    try { leerIdDeCuerpo('X'.repeat(500), 'asistencia_id') } catch (e) {
      expect(e.message).toContain('…')
      expect(e.message.length).toBeLessThan(250)
    }
    expect.hasAssertions()
  })
})

// Qué errores del servicio se contestan al que llamó y cuáles son un 500. Los
// dos controladores del R-56 lo usan: antes había una copia en cada uno (y el de
// atenciones, dos en el mismo archivo).
describe('responderError', () => {
  const resDoble = () => {
    const r = { codigo: null, cuerpo: null }
    r.status = c => { r.codigo = c; return r }
    r.json = b => { r.cuerpo = b; return r }
    return r
  }

  test('un 400 (malUso) se contesta con su mensaje y no llega a next', () => {
    const res = resDoble(), next = jest.fn()
    responderError(res, next, malUso('La modalidad de la atención no es válida'))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toEqual({ mensaje: 'La modalidad de la atención no es válida' })
    expect(next).not.toHaveBeenCalled()
  })

  test('un 404 (noEncontrado) también es de quien llamó', () => {
    const res = resDoble(), next = jest.fn()
    responderError(res, next, noEncontrado('No existe la gestión 9.'))
    expect(res.codigo).toBe(404)
    expect(res.cuerpo).toEqual({ mensaje: 'No existe la gestión 9.' })
    expect(next).not.toHaveBeenCalled()
  })

  // Lo demás es una falla del servidor: va a next intacto y sin responder, para
  // que el manejador global decida. Un 500 que se disfrazara de 400 mandaría a
  // quien llamó a «corregir» una petición que estaba bien.
  test.each([
    ['un error de MySQL', Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' })],
    ['un error con otro status', Object.assign(new Error('x'), { status: 503 })],
    ['un error sin status', new Error('x')],
    ['algo que no es un Error', 'texto'],
    ['undefined', undefined],
  ])('%s va a next sin responder', (_caso, err) => {
    const res = resDoble(), next = jest.fn()
    responderError(res, next, err)
    expect(next).toHaveBeenCalledWith(err)
    expect(res.codigo).toBeNull()
    expect(res.cuerpo).toBeNull()
  })
})

describe('eco', () => {
  test('cita un texto entre comillas y escapa lo que rompería el mensaje', () => {
    expect(eco('abc')).toBe('"abc"')
    expect(eco('con "comillas"')).toBe('"con \\"comillas\\""')
    expect(eco('dos\nlíneas')).toBe('"dos\\nlíneas"')
  })

  test('recorta en 40 caracteres y lo marca', () => {
    expect(eco('x'.repeat(40))).toBe(`"${'x'.repeat(40)}"`)
    expect(eco('x'.repeat(41))).toBe(`"${'x'.repeat(40)}…"`)
  })

  test('lo que no es texto también se puede citar', () => {
    expect(eco(42)).toBe('"42"')
    expect(eco(null)).toBe('"null"')
    expect(eco(undefined)).toBe('"undefined"')
  })
})
