// Informes de desinfección de vehículos — `GET /desinfecciones/registros`.
//
// Lo que se cuida acá, en orden de qué pasa si se rompe:
//
//  1. Que `total` salga de un COUNT sobre el conjunto filtrado COMPLETO y no
//     del tamaño de la página. Si eso se rompe la paginación es mentira: el
//     usuario nunca llega a la página 2 y la exportación se corta en la
//     primera página sin que nada falle.
//  2. Que la respuesta sea `{ filas, total }` y no un arreglo pelado, que es
//     lo que devolvía antes.
//  3. Que `tipo_vehiculo` filtre por `v.tipo` y que un valor fuera del enum se
//     rechace con 400 y `campo`, en vez de ignorarse en silencio.
//  4. Que `limite` y `offset` se validen como enteros antes de interpolarse en
//     el SQL.
//  5. Que las fechas salgan como texto `YYYY-MM-DD`. El pool no tiene
//     `dateStrings`, así que una fecha devuelta como objeto se serializa en UTC
//     y en Colombia la pantalla muestra el día anterior.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))
jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  guardarEvidencias: jest.fn(),
  descartarEvidencias: jest.fn(),
  enviarEvidenciasADrive: jest.fn(),
}))

const db = require('../../config/db')
const ctrl = require('../desinfecciones.controller')

// ── Dobles de Express ──────────────────────────────────────────────────────
const COORD = { usuario: 'COORD1', nombre: 'Coordinadora', rol: 'coordinador' }

function resFalso() {
  return {
    status_: 200,
    body: undefined,
    status(c) { this.status_ = c; return this },
    json(b)   { this.body = b; return this },
  }
}

// Las filas tal como las devuelve `SELECT_REGISTRO`: con las fechas ya
// formateadas por DATE_FORMAT, que es como llegan de verdad.
const FILAS = [
  {
    id: 900, vehiculo_id: 4, regla_id: 7, actividad_nombre: 'Desinfección choque',
    tipo_registro: 'EVIDENCIA', periodicidad_dias: 15, orden_servicio: null,
    observaciones: 'listo', dias_atraso: 4, registrado_por: 'COORD1',
    registrado_nombre: 'Coordinadora',
    fecha_ejecucion: '2026-11-24', fecha_programada: '2026-11-20',
    placa: 'WGY123', tipo: 'TRASLADO', evidencias: 1,
  },
  {
    id: 899, vehiculo_id: 5, regla_id: 5, actividad_nombre: 'Limpieza y lavado',
    tipo_registro: 'ORDEN_SERVICIO', periodicidad_dias: 30, orden_servicio: '4471',
    observaciones: null, dias_atraso: 0, registrado_por: 'OPER2',
    registrado_nombre: 'Operario',
    fecha_ejecucion: '2026-11-13', fecha_programada: '2026-11-13',
    placa: 'XKT987', tipo: 'CARROZA', evidencias: 0,
  },
]

// El total del conjunto filtrado es 8 y la página trae 2: así, un `total` que
// saliera del tamaño de la página se nota.
const TOTAL = 8

function prepararPool({ filas = FILAS, total = TOTAL } = {}) {
  db.query.mockImplementation(async sql => {
    if (/COUNT\(\*\) +AS total/i.test(sql)) return [[{ total }]]
    return [filas]
  })
}

/** Llama a `listarRegistros` con esa query y devuelve `{ status, body }`. */
async function pedir(query = {}) {
  const res = resFalso()
  const next = jest.fn()
  await ctrl.listarRegistros({ body: {}, params: {}, query, user: COORD }, res, next)
  if (next.mock.calls.length) throw next.mock.calls[0][0]
  return { status: res.status_, body: res.body }
}

/** Todo el SQL de la llamada, junto: así la prueba no depende del orden. */
const sqlDeLaLlamada = () => db.query.mock.calls.map(c => c[0]).join('\n')

/** El SQL de la consulta de filas (la que lleva LIMIT) y sus parámetros. */
const consultaDeFilas = () => db.query.mock.calls.find(c => /LIMIT/i.test(c[0]))
/** El SQL del conteo y sus parámetros. */
const consultaDelConteo = () => db.query.mock.calls.find(c => /COUNT\(\*\) +AS total/i.test(c[0]))

beforeEach(() => {
  jest.clearAllMocks()
  prepararPool()
})

// ═══════════════════════════════════════════════════════════════════════════
describe('GET /desinfecciones/registros — filtros y paginación', () => {
  test('filtra por tipo de vehículo', async () => {
    const res = await pedir({ tipo_vehiculo: 'CARROZA' })

    expect(res.status).toBe(200)
    expect(sqlDeLaLlamada()).toMatch(/v\.tipo = \?/)
    expect(consultaDeFilas()[1]).toContain('CARROZA')
    // El conteo lleva EL MISMO filtro: si no, el total contradice la tabla.
    expect(consultaDelConteo()[0]).toMatch(/v\.tipo = \?/)
    expect(consultaDelConteo()[1]).toContain('CARROZA')
  })

  test('el tipo de vehículo se normaliza a mayúsculas', async () => {
    const res = await pedir({ tipo_vehiculo: 'carroza' })

    expect(res.status).toBe(200)
    expect(consultaDeFilas()[1]).toContain('CARROZA')
  })

  test('rechaza un tipo de vehículo fuera del enum', async () => {
    const res = await pedir({ tipo_vehiculo: 'MOTO' })

    expect(res.status).toBe(400)
    expect(res.body.campo).toBe('tipo_vehiculo')
    expect(db.query).not.toHaveBeenCalled()
  })

  test('un tipo de vehículo vacío no filtra', async () => {
    const res = await pedir({ tipo_vehiculo: '' })

    expect(res.status).toBe(200)
    expect(sqlDeLaLlamada()).not.toMatch(/v\.tipo = \?/)
  })

  test('devuelve filas y total, no un arreglo pelado', async () => {
    const res = await pedir({})

    expect(Array.isArray(res.body)).toBe(false)
    expect(Array.isArray(res.body.filas)).toBe(true)
    expect(res.body.filas).toHaveLength(2)
    expect(typeof res.body.total).toBe('number')
    expect(res.body.total).toBe(TOTAL)
  })

  test('el total NO cambia al cambiar el límite', async () => {
    // Es la regresión que convierte la paginación en mentira: si el total
    // sale del tamaño de la página, el usuario nunca llega a la página 2.
    const a = await pedir({ limite: 1 })
    const b = await pedir({ limite: 50 })

    expect(a.body.total).toBe(b.body.total)
    expect(a.body.total).toBe(TOTAL)
  })

  test('el conteo va sobre el conjunto filtrado completo, sin LIMIT', async () => {
    await pedir({ limite: 1 })

    const [sqlConteo] = consultaDelConteo()
    expect(sqlConteo).toMatch(/COUNT\(\*\) +AS total/)
    expect(sqlConteo).not.toMatch(/LIMIT/i)
    expect(sqlConteo).not.toMatch(/OFFSET/i)
  })

  test('el límite y el offset viajan interpolados, no como marcadores', async () => {
    // Van interpolados porque ya están validados como enteros: con marcadores,
    // mysql2 los manda como texto.
    await pedir({ limite: 25, offset: 50 })

    const [sql, params] = consultaDeFilas()
    expect(sql).toMatch(/LIMIT 25 OFFSET 50/)
    expect(params).toEqual([])
  })

  test('sin límite ni offset, la página es de 50 desde el principio', async () => {
    await pedir({})

    expect(consultaDeFilas()[0]).toMatch(/LIMIT 50 OFFSET 0/)
  })

  test('rechaza un límite fuera de 1..200', async () => {
    expect((await pedir({ limite: 0 })).status).toBe(400)
    expect((await pedir({ limite: 201 })).status).toBe(400)
    expect((await pedir({ limite: 200 })).status).toBe(200)
    expect((await pedir({ limite: 1 })).status).toBe(200)
  })

  test('el campo del 400 del límite es «limite»', async () => {
    const res = await pedir({ limite: 500 })

    expect(res.status).toBe(400)
    expect(res.body.campo).toBe('limite')
    expect(db.query).not.toHaveBeenCalled()
  })

  test('rechaza un límite que no es entero', async () => {
    expect((await pedir({ limite: '1.5' })).status).toBe(400)
    expect((await pedir({ limite: 'muchas' })).status).toBe(400)
  })

  test('rechaza un offset negativo o que no es entero', async () => {
    const negativo = await pedir({ offset: -1 })
    expect(negativo.status).toBe(400)
    expect(negativo.body.campo).toBe('offset')

    expect((await pedir({ offset: '2.5' })).status).toBe(400)
    expect((await pedir({ offset: 'ayer' })).status).toBe(400)
    expect((await pedir({ offset: 0 })).status).toBe(200)
  })

  test('los filtros que ya existían siguen funcionando junto a los nuevos', async () => {
    const res = await pedir({
      vehiculo_id: '4', desde: '2026-11-01', hasta: '2026-11-24',
      actividad: 'choque', tipo_vehiculo: 'TRASLADO', limite: 10, offset: 10,
    })

    expect(res.status).toBe(200)
    const [sql, params] = consultaDeFilas()
    expect(sql).toContain('reg.vehiculo_id = ?')
    expect(sql).toContain('reg.fecha_ejecucion >= ?')
    expect(sql).toContain('reg.fecha_ejecucion <= ?')
    expect(sql).toContain('reg.actividad_nombre LIKE ?')
    expect(sql).toContain('v.tipo = ?')
    expect(params).toEqual([4, '2026-11-01', '2026-11-24', '%choque%', 'TRASLADO'])
    // El conteo lleva los mismos parámetros, en el mismo orden.
    expect(consultaDelConteo()[1]).toEqual(params)
  })

  test('un filtro sin resultados devuelve filas vacías y total 0', async () => {
    prepararPool({ filas: [], total: 0 })

    const res = await pedir({ tipo_vehiculo: 'OTRO' })

    expect(res.status).toBe(200)
    expect(res.body.filas).toEqual([])
    expect(res.body.total).toBe(0)
  })

  test('las fechas salen como texto YYYY-MM-DD, no como Date', async () => {
    // Guarda de la trampa UTC: el pool no fija dateStrings.
    const res = await pedir({})
    const f = res.body.filas[0]

    expect(typeof f.fecha_ejecucion).toBe('string')
    expect(f.fecha_ejecucion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof f.fecha_programada).toBe('string')
    expect(f.fecha_programada).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('las fechas se formatean en SQL y no en JavaScript', async () => {
    await pedir({})

    const [sql] = consultaDeFilas()
    expect(sql).toMatch(/DATE_FORMAT\(reg\.fecha_ejecucion, *'%Y-%m-%d'\) AS fecha_ejecucion/)
    expect(sql).toMatch(/DATE_FORMAT\(reg\.fecha_programada, *'%Y-%m-%d'\) AS fecha_programada/)
  })

  test('la fila trae las columnas que la pantalla necesita, sin agregar ninguna', async () => {
    const res = await pedir({})
    const f = res.body.filas[0]

    expect(f).toHaveProperty('dias_atraso')
    expect(f).toHaveProperty('placa')
    expect(f).toHaveProperty('tipo')
    expect(f).toHaveProperty('evidencias')
  })

  test('el total llega como número aunque la base lo devuelva como texto', async () => {
    db.query.mockImplementation(async sql => {
      if (/COUNT\(\*\) +AS total/i.test(sql)) return [[{ total: '8' }]]
      return [FILAS]
    })

    const res = await pedir({})

    expect(res.body.total).toBe(8)
  })

  test('una fecha inválida se sigue rechazando antes de consultar', async () => {
    const res = await pedir({ desde: '01/11/2026' })

    expect(res.status).toBe(400)
    expect(res.body.campo).toBe('desde')
    expect(db.query).not.toHaveBeenCalled()
  })
})
