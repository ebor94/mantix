// Informes de desinfección de vehículos — `GET /desinfecciones/registros` y
// `GET /desinfecciones/informes/flota`.
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
//  6. Que `resumen` describa TODO el conjunto filtrado y no la página, con las
//     diez claves que la pantalla pinta, los agregados como números y las dos
//     fechas como texto o `null`. Un resumen calculado sobre la página pone
//     «1 registro» encima de una tabla que dice 8.
//  7. Que `vencida` del panel de flota NO se crea la columna `estado`. El
//     barrido nocturno pone VENCIDA, pero entre que la fecha pasa y el barrido
//     corre hay una ventana en la que el estado almacenado miente, y una cifra
//     que la herede dice «0 vencidas» con vehículos vencidos en el patio.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))
jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  guardarEvidencias: jest.fn(),
  descartarEvidencias: jest.fn(),
  enviarEvidenciasADrive: jest.fn(),
  // Estas dos no las usa el controlador sino el ROUTER, que el bloque de
  // `/informes/flota` monta de verdad (ver el comentario de ese describe). Sin
  // ellas `router.post('/registro', …, undefined)` lanza al cargar el archivo
  // y la suite entera no arranca, con el error en una línea que no es de acá.
  subidaEvidencia: jest.fn((req, res, next) => next()),
  servirEvidencia: jest.fn((req, res) => res.status(200).end()),
}))

const express = require('express')
const request = require('supertest')
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba')
const db = require('../../config/db')
const ctrl = require('../desinfecciones.controller')
const rutasDesinfecciones = require('../../routes/desinfecciones.routes')

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

// Los agregados como los entrega mysql2: `SUM`/`COUNT` llegan como texto o
// `Decimal` según el driver, nunca garantizados como número. Si el controlador
// no los convierte, el frontend suma cadenas y «6» + «2» da «62».
const RESUMEN = {
  registros: '8', a_tiempo: '6', con_atraso: '2', atraso_maximo: '2',
  con_orden_servicio: '7', con_evidencia: '1',
  vehiculos_distintos: '7', personas_distintas: '2',
  primera_ejecucion: '2026-11-13', ultima_ejecucion: '2026-11-24',
}

// Lo que devuelve de verdad la consulta de agregados sobre un conjunto vacío:
// `COUNT` da 0, los `COALESCE(SUM(...), 0)` dan 0 y `DATE_FORMAT(MIN(NULL))`
// da NULL.
const RESUMEN_VACIO = {
  registros: '0', a_tiempo: '0', con_atraso: '0', atraso_maximo: '0',
  con_orden_servicio: '0', con_evidencia: '0',
  vehiculos_distintos: '0', personas_distintas: '0',
  primera_ejecucion: null, ultima_ejecucion: null,
}

const CLAVES_RESUMEN = [
  'registros', 'a_tiempo', 'con_atraso', 'atraso_maximo',
  'con_orden_servicio', 'con_evidencia', 'vehiculos_distintos',
  'personas_distintas', 'primera_ejecucion', 'ultima_ejecucion',
]

// El enrutado del mock discrimina por `COUNT(*) AS total` y por `AS registros`,
// NUNCA por `COUNT(*)` a secas: `SELECT_REGISTRO` lleva un subselect
// `(SELECT COUNT(*) FROM h360_desinf_evidencia …)`, así que un `/COUNT\(\*\)/`
// le respondería el conteo también a la consulta de filas.
function prepararPool({ filas = FILAS, total = TOTAL, resumen = RESUMEN } = {}) {
  db.query.mockImplementation(async sql => {
    if (/COUNT\(\*\) +AS total/i.test(sql)) return [[{ total }]]
    if (/AS registros/i.test(sql)) return [[resumen]]
    // La página sale recortada por el LIMIT/OFFSET interpolado, como la haría
    // la base: así una prueba puede pedir una página más chica que el conjunto
    // y comprobar que el resumen sigue describiendo el conjunto entero.
    const pagina = /LIMIT (\d+) OFFSET (\d+)/i.exec(sql)
    if (pagina) {
      const desde = Number(pagina[2])
      return [filas.slice(desde, desde + Number(pagina[1]))]
    }
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
/** El SQL de la consulta de agregados del resumen y sus parámetros. */
const consultaDelResumen = () => db.query.mock.calls.find(c => /AS registros/i.test(c[0]))

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
    // Van interpolados, con los valores ya validados como enteros. Con
    // marcadores también funcionaría —el pool usa protocolo de texto— así que
    // esto fija la forma que eligió el controlador, no una restricción
    // técnica.
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

// ═══════════════════════════════════════════════════════════════════════════
describe('GET /desinfecciones/registros — resumen del período', () => {
  test('se calcula sobre todo el filtro y no sobre la página', async () => {
    // Con límite 1 la página trae una fila, pero el resumen tiene que
    // describir el conjunto entero: si se calculara sobre la página, la
    // pantalla mostraría «1 registro» encima de una tabla que dice 8.
    const res = await pedir({ limite: 1 })

    expect(res.body.filas).toHaveLength(1)
    expect(res.body.resumen.registros).toBe(res.body.total)
    expect(res.body.resumen.registros).toBe(TOTAL)
  })

  test('la consulta del resumen no lleva LIMIT ni OFFSET', async () => {
    await pedir({ limite: 1, offset: 0 })

    const [sql] = consultaDelResumen()
    expect(sql).not.toMatch(/LIMIT/i)
    expect(sql).not.toMatch(/OFFSET/i)
  })

  test('el resumen lleva los mismos filtros y parámetros que la página', async () => {
    await pedir({
      vehiculo_id: '4', desde: '2026-11-01', hasta: '2026-11-24',
      actividad: 'choque', tipo_vehiculo: 'TRASLADO', limite: 1,
    })

    const [sqlResumen, paramsResumen] = consultaDelResumen()
    expect(sqlResumen).toContain('reg.vehiculo_id = ?')
    expect(sqlResumen).toContain('reg.fecha_ejecucion >= ?')
    expect(sqlResumen).toContain('reg.fecha_ejecucion <= ?')
    expect(sqlResumen).toContain('reg.actividad_nombre LIKE ?')
    // El filtro por tipo es del vehículo, así que el resumen necesita el JOIN.
    expect(sqlResumen).toContain('v.tipo = ?')
    expect(sqlResumen).toMatch(/LEFT JOIN vehiculos v/)
    expect(paramsResumen).toEqual(consultaDeFilas()[1])
  })

  test('trae las diez claves que pinta la pantalla, sin ninguna más', async () => {
    const { resumen } = (await pedir({})).body

    expect(Object.keys(resumen).sort()).toEqual([...CLAVES_RESUMEN].sort())
  })

  test('a_tiempo y con_atraso suman los registros', async () => {
    const { resumen } = (await pedir({})).body

    expect(resumen.a_tiempo + resumen.con_atraso).toBe(resumen.registros)
  })

  test('a_tiempo cuenta también los dias_atraso en NULL', async () => {
    // `dias_atraso` admite NULL: un registro de una programación que nunca
    // tuvo fecha no tiene contra qué compararse. Sin el `IS NULL`, esas filas
    // no caen en ninguno de los dos lados y la suma deja de dar `registros`.
    await pedir({})

    const [sql] = consultaDelResumen()
    expect(sql).toMatch(/reg\.dias_atraso <= 0 OR reg\.dias_atraso IS NULL/)
    expect(sql).toMatch(/SUM\(reg\.dias_atraso > 0\)/)
  })

  test('los agregados llegan como números aunque la base los dé como texto', async () => {
    // mysql2 entrega SUM/COUNT como texto o Decimal: sin Number(), el
    // frontend concatena cadenas en vez de sumar.
    const { resumen } = (await pedir({})).body

    for (const clave of CLAVES_RESUMEN.filter(c => !c.endsWith('_ejecucion')))
      expect(typeof resumen[clave]).toBe('number')
    expect(resumen.registros).toBe(8)
    expect(resumen.a_tiempo).toBe(6)
    expect(resumen.con_atraso).toBe(2)
    expect(resumen.atraso_maximo).toBe(2)
    expect(resumen.con_orden_servicio).toBe(7)
    expect(resumen.con_evidencia).toBe(1)
    expect(resumen.vehiculos_distintos).toBe(7)
    expect(resumen.personas_distintas).toBe(2)
  })

  test('con un filtro sin resultados devuelve ceros y fechas en null', async () => {
    prepararPool({ filas: [], total: 0, resumen: RESUMEN_VACIO })

    const res = await pedir({ desde: '2000-01-01', hasta: '2000-01-02' })

    expect(res.body.total).toBe(0)
    expect(res.body.resumen.registros).toBe(0)
    expect(res.body.resumen.atraso_maximo).toBe(0)
    expect(res.body.resumen.primera_ejecucion).toBeNull()
    expect(res.body.resumen.ultima_ejecucion).toBeNull()
  })

  test('si la base no devuelve ninguna fila de agregados, el resumen sale en ceros', async () => {
    // Pasa en las pruebas del módulo que dejan el mock en `[[]]`, y pasaría en
    // producción si la consulta se cayera a cero filas: el resumen tiene que
    // salir en ceros, nunca reventar por desestructurar `undefined`.
    db.query.mockImplementation(async sql => {
      if (/COUNT\(\*\) +AS total/i.test(sql)) return [[{ total: 0 }]]
      if (/AS registros/i.test(sql)) return [[]]
      return [[]]
    })

    const res = await pedir({})

    expect(res.status).toBe(200)
    expect(res.body.resumen.registros).toBe(0)
    expect(res.body.resumen.primera_ejecucion).toBeNull()
  })

  test('las fechas del resumen son texto YYYY-MM-DD', async () => {
    const { resumen } = (await pedir({})).body

    expect(typeof resumen.primera_ejecucion).toBe('string')
    expect(resumen.primera_ejecucion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(resumen.ultima_ejecucion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('las fechas del resumen se formatean en SQL y no en JavaScript', async () => {
    // Guarda de la trampa UTC: el pool no fija dateStrings, así que un MIN/MAX
    // sin DATE_FORMAT vuelve como Date y Express lo serializa un día antes.
    await pedir({})

    const [sql] = consultaDelResumen()
    expect(sql).toMatch(/DATE_FORMAT\(MIN\(reg\.fecha_ejecucion\), *'%Y-%m-%d'\) AS primera_ejecucion/)
    expect(sql).toMatch(/DATE_FORMAT\(MAX\(reg\.fecha_ejecucion\), *'%Y-%m-%d'\) AS ultima_ejecucion/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// GET /desinfecciones/informes/flota
//
// Este bloque monta el ROUTER de verdad en vez de llamar al controlador como
// el resto del archivo, y la razón es la restricción misma: el 403 lo pone
// `requireRol` EN LA RUTA, y ese 403 *es* la protección del panel —el frontend
// no repite ninguna lista de roles para decidir si lo pinta (repetirla fue la
// causa raíz del bug 46899d2). Llamando al controlador directo, el 403 nunca
// aparecería y una ruta a la que se le olvidara el `requireRol` pasaría las
// pruebas igual.
//
// `verifyToken` no se monta acá: lo pone routes/index.js y su compuerta la
// cubre desinfecciones.routes.test.js. Acá el usuario se inyecta a mano para
// que lo único que decida el acceso sea la lista de roles de la ruta.
// ═══════════════════════════════════════════════════════════════════════════

// Como los entrega mysql2: `SUM(...)` llega como texto o `Decimal` según el
// driver, nunca garantizado como número. Las cifras de producción medidas el
// 2026-11-25: 54 filas — 21 al día, 0 vencidas, 31 sin fecha, 2 NO_APLICA.
// Las cuatro suman el total, y eso es parte del contrato: ver la prueba de la
// partición más abajo.
const FLOTA = { total: '54', al_dia: '21', vencida: '0', sin_fecha: '31', no_aplica: '2' }

const CLAVES_FLOTA = ['total', 'al_dia', 'vencida', 'sin_fecha', 'no_aplica',
  'vehiculos_inactivos_por_desinfeccion']

// Las cuatro que tienen que particionar el total. `total` y los inactivos
// quedan fuera: uno es el denominador y el otro cuenta vehículos, no filas de
// programación.
const CLAVES_PARTICION = ['al_dia', 'vencida', 'sin_fecha', 'no_aplica']

// El enrutado discrimina por los alias `AS inactivos` y `AS al_dia`, NUNCA
// por `/COUNT\(\*\)/`: las dos consultas llevan conteos y un patrón genérico le
// devolvería a una la cifra de la otra.
function prepararFlota({ totales = FLOTA, inactivos = '0' } = {}) {
  db.query.mockImplementation(async sql => {
    if (/AS inactivos/i.test(sql))  return [[{ inactivos }]]
    if (/AS al_dia/i.test(sql))     return [[totales]]
    return [[]]
  })
}

let rolDelUsuario = 'coordinador'
const app = express()
app.use(express.json())
app.use((req, res, next) => {
  req.user = { usuario: 'U1', nombre: 'Usuaria', rol: rolDelUsuario }
  next()
})
app.use('/desinfecciones', rutasDesinfecciones)

/** Pide el informe de flota con ese rol y devuelve `{ status, body }`. */
async function pedirFlota({ rol = 'coordinador' } = {}) {
  rolDelUsuario = rol
  const res = await request(await servir(app)).get('/desinfecciones/informes/flota')
  return { status: res.status, body: res.body }
}

describe('GET /desinfecciones/informes/flota', () => {
  // Con paréntesis y no `beforeEach(prepararFlota)`: así el hook nunca recibe
  // el `done` de jest donde la función espera sus opciones.
  beforeEach(() => prepararFlota())
  afterEach(() => cerrarServidores())

  test('el coordinador recibe las cifras', async () => {
    const res = await pedirFlota({ rol: 'coordinador' })

    expect(res.status).toBe(200)
    expect(res.body.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(res.body.totales).toEqual(expect.objectContaining({
      total: expect.any(Number), al_dia: expect.any(Number),
      vencida: expect.any(Number), sin_fecha: expect.any(Number),
      no_aplica: expect.any(Number),
      vehiculos_inactivos_por_desinfeccion: expect.any(Number),
    }))
  })

  test('el admin también', async () => {
    expect((await pedirFlota({ rol: 'admin' })).status).toBe(200)
  })

  test.each(['asistente', 'asistente_tanatologo', 'asesor', 'supervisora'])(
    'responde 403 al rol %s, que solo opera', async (rol) => {
      const res = await pedirFlota({ rol })

      expect(res.status).toBe(403)
      // El 403 sale antes de tocar la base: no se cuentan cifras para
      // descartarlas después.
      expect(db.query).not.toHaveBeenCalled()
    })

  test('trae las seis claves que pinta el panel, sin ninguna más', async () => {
    const res = await pedirFlota({ rol: 'coordinador' })

    expect(Object.keys(res.body.totales).sort()).toEqual([...CLAVES_FLOTA].sort())
  })

  test('las cifras llegan como números aunque la base las dé como texto', async () => {
    // Sin Number(), el panel concatena cadenas: «21» + «0» da «210».
    const { totales } = (await pedirFlota({ rol: 'coordinador' })).body

    for (const clave of CLAVES_FLOTA) expect(typeof totales[clave]).toBe('number')
    expect(totales.total).toBe(54)
    expect(totales.al_dia).toBe(21)
    expect(totales.sin_fecha).toBe(31)
    expect(totales.no_aplica).toBe(2)
  })

  test('cuenta vencida la fecha pasada aunque el estado diga PROGRAMADA', async () => {
    // Entre que la fecha pasa y el barrido nocturno corre, el estado
    // almacenado miente. La cifra no puede heredar esa mentira.
    await pedirFlota({ rol: 'coordinador' })
    const sql = db.query.mock.calls.map(c => c[0]).join('\n')
    expect(sql).toMatch(/p\.fecha_prox < \?/)
  })

  test('las cuatro cifras suman el total', async () => {
    // No es aritmética decorativa: nadie mira cuatro números juntos sin
    // sumarlos. Una versión anterior de la consulta no sumaba — una fila
    // PENDIENTE con fecha futura no caía en ninguna cifra y una PROGRAMADA sin
    // fecha caía en dos— y con los datos de hoy daba 54 de pura casualidad.
    const { totales } = (await pedirFlota({ rol: 'coordinador' })).body

    const suma = CLAVES_PARTICION.reduce((acc, k) => acc + totales[k], 0)
    expect(suma).toBe(totales.total)
  })

  test('al día y vencida se parten por la fecha, sin solaparse', async () => {
    // El corte es `< hoy` contra `>= hoy` sobre la MISMA condición de tener
    // fecha: así ninguna fila puede caer en las dos ni quedarse afuera.
    await pedirFlota({ rol: 'coordinador' })
    const sql = db.query.mock.calls.find(c => /AS al_dia/i.test(c[0]))[0]

    expect(sql).toMatch(/p\.fecha_prox IS NOT NULL\s+AND \(p\.fecha_prox < \?/)
    expect(sql).toMatch(/p\.fecha_prox IS NOT NULL\s+AND p\.fecha_prox >= \?/)
  })

  test('cada cifra de la partición excluye NO_APLICA, salvo la propia', async () => {
    await pedirFlota({ rol: 'coordinador' })
    const sql = db.query.mock.calls.find(c => /AS al_dia/i.test(c[0]))[0]

    // Tres guardas `<> 'NO_APLICA'` (sin fecha, vencida, al día) más el
    // `= 'NO_APLICA'` de su propia cifra.
    expect((sql.match(/p\.estado <> 'NO_APLICA'/g) || []).length).toBe(3)
    expect(sql).toMatch(/SUM\(p\.estado = 'NO_APLICA'\)/)
  })

  test('sin_fecha cuenta las que no tienen fecha y no son NO_APLICA', async () => {
    await pedirFlota({ rol: 'coordinador' })
    const sql = db.query.mock.calls.map(c => c[0]).join('\n')
    // `\s+` y no un espacio: la condición va partida en dos líneas en el SQL.
    expect(sql).toMatch(/p\.estado <> 'NO_APLICA'\s+AND p\.fecha_prox IS NULL/)
  })

  test('el hoy lo manda el servidor y no CURDATE()', async () => {
    // La zona del motor de base de datos no es la del negocio: con la base en
    // UTC, después de las 19:00 de Cúcuta CURDATE() ya es mañana y las cifras
    // se corren un día.
    const res = await pedirFlota({ rol: 'coordinador' })

    const [sqlTotales, params] = db.query.mock.calls.find(c => /AS al_dia/i.test(c[0]))
    expect(sqlTotales).not.toMatch(/CURDATE\(\)/i)
    expect(params).toEqual([res.body.fecha, res.body.fecha])
  })

  test('los inactivos son solo los que bajó la desinfección', async () => {
    // `inactivo_origen` existe para que el módulo no cuente como suyo el
    // vehículo que alguien bajó a mano por un choque o un mantenimiento.
    prepararFlota({ inactivos: '3' })

    const res = await pedirFlota({ rol: 'coordinador' })

    expect(res.body.totales.vehiculos_inactivos_por_desinfeccion).toBe(3)
    const [sqlInactivos] = db.query.mock.calls.find(c => /AS inactivos/i.test(c[0]))
    expect(sqlInactivos).toMatch(/activo = 0 AND inactivo_origen = 'DESINFECCION'/)
  })

  test('si la base no devuelve filas, las cifras salen en ceros y no en 500', async () => {
    // `const [[fila]]` con `fila?.campo ?? 0` y no `const [[{ campo }]]`:
    // desestructurar un objeto de `undefined` lanza un TypeError que se va por
    // `next(err)` y el 500 llega sin que se vea la causa.
    db.query.mockImplementation(async () => [[]])

    const res = await pedirFlota({ rol: 'coordinador' })

    expect(res.status).toBe(200)
    expect(res.body.totales).toEqual({
      total: 0, al_dia: 0, vencida: 0, sin_fecha: 0, no_aplica: 0,
      vehiculos_inactivos_por_desinfeccion: 0,
    })
  })

  test('no consulta la programación con la plantilla del tablero', async () => {
    // El endpoint es nuevo justamente para no tocar `SELECT_PROGRAMACION`, que
    // comparten cuatro llamadas —dos de escritura— ni el tablero, que responde
    // un arreglo pelado que la vista en producción ya consume.
    await pedirFlota({ rol: 'coordinador' })

    const sql = db.query.mock.calls.map(c => c[0]).join('\n')
    expect(sql).not.toMatch(/JOIN h360_desinf_regla/)
    expect(sql).not.toMatch(/dias_para_vencer/)
  })
})
