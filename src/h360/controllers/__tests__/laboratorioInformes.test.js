// Informes de cumplimiento del laboratorio.
//
// Lo que se cuida acá, en orden de qué duele más si se rompe:
//
//  1. Que las POR_EVENTO salgan APARTE y COMO CONTEO, nunca con porcentaje. No
//     tienen denominador —no se sabe cuántas preservaciones ni cuántas
//     asistencias hubo—, así que no existe un «se cumplió el 80%». Un
//     porcentaje inventado en un informe de auditoría sanitaria es peor que no
//     tener el dato.
//  2. Que un período sin tareas devuelva `porcentaje: null` y nunca `NaN` ni
//     `100`. Decir «100% de cumplimiento» cuando no hubo nada que cumplir es
//     exactamente la mentira que este módulo existe para evitar.
//  3. Que las OMITIDA se cuenten como está DOCUMENTADO y que los cuatro
//     conteos crudos viajen siempre, para que cualquier otra regla se pueda
//     recalcular desde la respuesta sin volver a consultar.
//  4. Que toda fecha que sale en una respuesta venga formateada en SQL. El pool
//     no tiene `dateStrings`: un DATE devuelto crudo sale como objeto, Express
//     lo serializa en UTC y en Colombia (UTC-5) la pantalla muestra el día
//     anterior. Y que no se traiga ningún TIMESTAMP (`created_at`,
//     `cerrada_at`), que tiene el mismo problema.
//  5. Que un rango imposible se rechace con 400 ANTES de consultar.
//  6. Que la paginación del historial tenga tope: es lo que el frontend recorre
//     para armar el Excel, y sin tope una exportación de un año se trae la
//     tabla entera en una sola respuesta.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))

const db   = require('../../config/db')
const ctrl = require('../laboratorioInformes.controller')

// ── Dobles de Express ──────────────────────────────────────────────────────
function resFalso() {
  const res = {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  }
  return res
}

const COORD = { usuario: 'COORD1', nombre: 'Coordinadora', rol: 'coordinador' }

function reqFalso({ body = {}, params = {}, query = {}, user = COORD } = {}) {
  return { body, params, query, user }
}

async function llamar(fn, req) {
  const res = resFalso()
  const next = jest.fn()
  await fn(req, res, next)
  return { res, next }
}

// ── El reloj ───────────────────────────────────────────────────────────────
//
// El instante se fija para que el período por defecto no dependa del día en que
// se corran las pruebas. 2026-11-25 20:00 UTC son las 15:00 de Bogotá: el mismo
// día en las dos zonas, así que ninguna afirmación de acá se apoya en el
// corrimiento.
const fijarInstante = instante => jest.useFakeTimers({
  now: instante,
  doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate',
    'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
})
const INSTANTE   = new Date('2026-11-25T20:00:00Z')
const HOY        = '2026-11-25'   // miércoles
const PRIMERO    = '2026-11-01'

/**
 * Pool falso enrutado por un fragmento distintivo de cada consulta. Se enruta
 * por el GROUP BY y por los alias, no por el nombre de la tabla: las dos
 * consultas de `cumplimiento` agrupan `h360_lab_tarea` y enrutar por tabla las
 * confundiría. `pasos` guarda el orden real de todo lo que pasó.
 */
const pasos = []

function prepararPool({
  estados = [],
  actividades = [],
  eventos = [],
  eventosConfigurados = [],
  personas = [],
  omitidasPorPersona = [],
  registros = [],
  total = 0,
} = {}) {
  db.query.mockImplementation(async (sql, params) => {
    const s = String(sql)
    if (/AS veces/i.test(s))                 { pasos.push({ paso: 'eventos',      sql: s, params }); return [eventos] }
    if (/GROUP BY a\.nombre/i.test(s))       { pasos.push({ paso: 'actividades',  sql: s, params }); return [actividades] }
    if (/GROUP BY t\.estado/i.test(s))       { pasos.push({ paso: 'estados',      sql: s, params }); return [estados] }
    if (/GROUP BY t\.cerrada_por/i.test(s))  { pasos.push({ paso: 'omitidas',     sql: s, params }); return [omitidasPorPersona] }
    if (/GROUP BY g\.registrado_por/i.test(s)) { pasos.push({ paso: 'personas',   sql: s, params }); return [personas] }
    if (/LIMIT \? OFFSET \?/i.test(s))       { pasos.push({ paso: 'historial',    sql: s, params }); return [registros] }
    if (/COUNT\(\*\) AS total/i.test(s))     { pasos.push({ paso: 'total',        sql: s, params }); return [[{ total }]] }
    if (/POR_EVENTO/.test(s))                { pasos.push({ paso: 'configuradas', sql: s, params }); return [eventosConfigurados] }
    pasos.push({ paso: 'otra', sql: s, params })
    return [[]]
  })
}

const soloPasos = () => pasos.map(p => p.paso)
const sqlDe = paso => String((pasos.find(p => p.paso === paso) || {}).sql || '')
const paramsDe = paso => (pasos.find(p => p.paso === paso) || {}).params

beforeEach(() => {
  jest.clearAllMocks()
  pasos.length = 0
  fijarInstante(INSTANTE)
  prepararPool()
})

afterEach(() => { jest.useRealTimers() })

// ═══════════════════════════════════════════════════════════════════════════
// Lo crítico: las POR_EVENTO no llevan porcentaje
// ═══════════════════════════════════════════════════════════════════════════

describe('cumplimiento — las POR_EVENTO van aparte y sin porcentaje', () => {
  const EVENTOS = [
    { actividad: 'Lavado de tubería', bloque: 'LABORATORIO', veces: 3 },
    { actividad: 'Camillas',          bloque: 'LABORATORIO', veces: 12 },
  ]

  test('cada POR_EVENTO trae `veces` y NINGÚN campo de porcentaje', async () => {
    prepararPool({ eventos: EVENTOS })
    const { res, next } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.por_evento.length).toBe(2)

    for (const e of res.cuerpo.por_evento) {
      expect(typeof e.veces).toBe('number')
      // No es que valga null: es que el campo NO EXISTE. Un `porcentaje: null`
      // en la pantalla invita a llenarlo; la ausencia dice que no aplica.
      expect(e).not.toHaveProperty('porcentaje')
      expect(e).not.toHaveProperty('porcentaje_estricto')
      expect(Object.keys(e).some(k => /porcentaje/i.test(k))).toBe(false)
    }
  })

  // La separación es ESTRUCTURAL —una POR_EVENTO no produce fila en
  // h360_lab_tarea— y los conteos salen de la frecuencia COPIADA en el
  // registro, no de la regla: si alguien cambia la frecuencia hoy, el pasado no
  // se reescribe.
  test('los conteos salen de la frecuencia copiada en h360_lab_registro', async () => {
    prepararPool({ eventos: EVENTOS })
    await llamar(ctrl.cumplimiento, reqFalso())

    const sql = sqlDe('eventos')
    expect(sql).toMatch(/FROM h360_lab_registro/i)
    expect(sql).toMatch(/g\.frecuencia\s*=\s*'POR_EVENTO'/i)
    expect(sql).toMatch(/COUNT\(\*\)\s+AS veces/i)
  })

  // Una POR_EVENTO configurada de la que no hubo ninguna ejecución tiene que
  // aparecer con 0: «no pasó nunca» y «no está configurada» son dos cosas
  // distintas, y en una auditoría la diferencia importa.
  test('una POR_EVENTO configurada sin ejecuciones sale con veces 0', async () => {
    prepararPool({
      eventos: [{ actividad: 'Camillas', bloque: 'LABORATORIO', veces: 4 }],
      eventosConfigurados: [
        { actividad: 'Camillas',          bloque: 'LABORATORIO' },
        { actividad: 'Lavado de tubería', bloque: 'LABORATORIO' },
      ],
    })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    const porNombre = Object.fromEntries(res.cuerpo.por_evento.map(e => [e.actividad, e.veces]))
    expect(porNombre['Camillas']).toBe(4)
    expect(porNombre['Lavado de tubería']).toBe(0)
    expect(res.cuerpo.por_evento.every(e => !('porcentaje' in e))).toBe(true)
  })

  // Las tareas NO se filtran por la frecuencia de la regla. Si alguien pasa una
  // DIARIA a POR_EVENTO, sus tareas viejas siguen siendo obligaciones reales con
  // resultado real: filtrarlas por `r.frecuencia` las borraría del informe.
  test('la consulta de tareas no filtra por frecuencia', async () => {
    await llamar(ctrl.cumplimiento, reqFalso())

    const sql = sqlDe('estados')
    expect(sql).toMatch(/FROM h360_lab_tarea/i)
    expect(sql).not.toMatch(/frecuencia/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El porcentaje que no se inventa
// ═══════════════════════════════════════════════════════════════════════════

describe('cumplimiento — el porcentaje', () => {
  test('un período sin tareas da porcentaje null, no NaN ni 100', async () => {
    prepararPool({ estados: [], actividades: [], eventos: [] })
    const { res, next } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(next).not.toHaveBeenCalled()
    const p = res.cuerpo.programadas

    expect(p.total).toBe(0)
    expect(p.porcentaje).toBeNull()
    expect(p.porcentaje_estricto).toBeNull()
    expect(Number.isNaN(p.porcentaje)).toBe(false)
    expect(p.porcentaje).not.toBe(100)
    expect(p.porcentaje).not.toBe(0)
    expect(res.cuerpo.por_actividad).toEqual([])

    // Y el JSON serializado tampoco trae un NaN disfrazado de null por
    // JSON.stringify: el null tiene que estar en el objeto.
    expect(JSON.parse(JSON.stringify(res.cuerpo)).programadas.porcentaje).toBeNull()
  })

  test('suma los cuatro estados y publica los conteos crudos', async () => {
    prepararPool({ estados: [
      { estado: 'HECHA', total: 7 }, { estado: 'OMITIDA', total: 2 },
      { estado: 'NO_HECHA', total: 1 }, { estado: 'PENDIENTE', total: 4 },
    ] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(res.cuerpo.programadas).toMatchObject({
      total: 14, hechas: 7, omitidas: 2, no_hechas: 1, pendientes: 4,
    })
  })

  // LA DECISIÓN DE NEGOCIO, fijada en una prueba para que cambiarla sea
  // explícito: la OMITIDA sale del denominador del porcentaje principal (el
  // motivo es legítimo y castigarla castiga lo correcto) pero NUNCA se esconde:
  // viaja su conteo y el `porcentaje_estricto`, que sí la cuenta como
  // incumplimiento.
  test('la OMITIDA sale del denominador del porcentaje y entra en el estricto', async () => {
    prepararPool({ estados: [
      { estado: 'HECHA', total: 7 }, { estado: 'OMITIDA', total: 2 },
      { estado: 'NO_HECHA', total: 1 },
    ] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    // 7 de 8 exigibles (10 - 2 omitidas) = 87.5
    expect(res.cuerpo.programadas.porcentaje).toBe(87.5)
    // 7 de 10, contando las omitidas como no cumplidas = 70
    expect(res.cuerpo.programadas.porcentaje_estricto).toBe(70)
  })

  // La PENDIENTE sí cuenta como no cumplida: solo las DIARIA se cierran solas,
  // así que una semanal atrasada se queda PENDIENTE para siempre y excluirla la
  // haría desaparecer del indicador justo cuando más dice.
  test('la PENDIENTE cuenta como no cumplida en el denominador', async () => {
    prepararPool({ estados: [{ estado: 'HECHA', total: 3 }, { estado: 'PENDIENTE', total: 1 }] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(res.cuerpo.programadas.porcentaje).toBe(75)
  })

  // El caso que un redondeo descuidado vuelve 0 o 100: todo omitido. No hubo
  // nada exigible, así que no hay porcentaje que dar.
  test('una actividad con solo omitidas da porcentaje null, no 0 ni 100', async () => {
    prepararPool({ actividades: [
      { actividad: 'Desinfección de trampa 3 y 4', bloque: 'TRAMPA_GRASA', estado: 'OMITIDA', total: 4 },
    ] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    const fila = res.cuerpo.por_actividad[0]
    expect(fila).toMatchObject({ total: 4, omitidas: 4, hechas: 0 })
    expect(fila.porcentaje).toBeNull()
    expect(fila.porcentaje_estricto).toBe(0)   // 0 de 4: ese sí tiene denominador
  })

  test('agrupa por actividad con su bloque y su propio porcentaje', async () => {
    prepararPool({ actividades: [
      { actividad: 'Instrumental', bloque: 'LABORATORIO', estado: 'HECHA',    total: 9 },
      { actividad: 'Instrumental', bloque: 'LABORATORIO', estado: 'NO_HECHA', total: 1 },
      { actividad: 'Limpieza del comedor', bloque: 'OPERATIVA', estado: 'HECHA', total: 5 },
    ] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(res.cuerpo.por_actividad).toEqual([
      { actividad: 'Instrumental', bloque: 'LABORATORIO', total: 10, hechas: 9,
        omitidas: 0, no_hechas: 1, pendientes: 0, porcentaje: 90, porcentaje_estricto: 90 },
      { actividad: 'Limpieza del comedor', bloque: 'OPERATIVA', total: 5, hechas: 5,
        omitidas: 0, no_hechas: 0, pendientes: 0, porcentaje: 100, porcentaje_estricto: 100 },
    ])
  })

  // El agregado puede volver como texto según el driver: sumar texto concatena
  // («7» + «2» = «72») y el informe diría cualquier cosa.
  test('normaliza los conteos que vengan como texto', async () => {
    prepararPool({ estados: [{ estado: 'HECHA', total: '7' }, { estado: 'NO_HECHA', total: '3' }] })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(res.cuerpo.programadas.total).toBe(10)
    expect(res.cuerpo.programadas.porcentaje).toBe(70)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El período
// ═══════════════════════════════════════════════════════════════════════════

describe('cumplimiento — el período', () => {
  test('por defecto va del primero del mes al «hoy» de Bogotá', async () => {
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(res.cuerpo.desde).toBe(PRIMERO)
    expect(res.cuerpo.hasta).toBe(HOY)
    expect(paramsDe('estados')).toEqual([PRIMERO, HOY])
  })

  test('respeta el rango pedido y lo pasa como texto a la consulta', async () => {
    const { res } = await llamar(ctrl.cumplimiento,
      reqFalso({ query: { desde: '2026-10-01', hasta: '2026-10-31' } }))

    expect(res.cuerpo).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(paramsDe('estados')).toEqual(['2026-10-01', '2026-10-31'])
  })

  test('desde posterior a hasta da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.cumplimiento,
      reqFalso({ query: { desde: '2026-11-25', hasta: '2026-11-01' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'desde' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('una fecha que no existe da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.cumplimiento, reqFalso({ query: { desde: '2026-02-31' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'desde' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('filtra por laboratorio y valida el id', async () => {
    await llamar(ctrl.cumplimiento, reqFalso({ query: { laboratorio_id: '2' } }))
    expect(sqlDe('estados')).toMatch(/t\.laboratorio_id = \?/)
    expect(paramsDe('estados')).toEqual([PRIMERO, HOY, 2])

    pasos.length = 0
    db.query.mockClear()
    const { res } = await llamar(ctrl.cumplimiento, reqFalso({ query: { laboratorio_id: 'x' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'laboratorio_id' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('las fechas de la respuesta son texto y el JSON no trae ningún instante ISO', async () => {
    prepararPool({
      estados: [{ estado: 'HECHA', total: 2 }],
      actividades: [{ actividad: 'Instrumental', bloque: 'LABORATORIO', estado: 'HECHA', total: 2 }],
      eventos: [{ actividad: 'Camillas', bloque: 'LABORATORIO', veces: 1 }],
    })
    const { res } = await llamar(ctrl.cumplimiento, reqFalso())

    expect(typeof res.cuerpo.desde).toBe('string')
    expect(res.cuerpo.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(res.cuerpo.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  test('ninguna consulta trae TIMESTAMP', async () => {
    await llamar(ctrl.cumplimiento, reqFalso())
    for (const p of pasos) expect(p.sql).not.toMatch(/created_at|updated_at|cerrada_at|drive_at/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Quién cerró qué
// ═══════════════════════════════════════════════════════════════════════════

describe('porPersona', () => {
  const PERSONAS = [
    { usuario: 'TANA1', nombre: 'Tanatólogo', hechas: 40, por_evento: 5, atrasadas: 2,
      primera_fecha: '2026-11-02', ultima_fecha: '2026-11-25' },
    { usuario: 'ASIS1', nombre: 'Asistente',  hechas: 11, por_evento: 0, atrasadas: 0,
      primera_fecha: '2026-11-10', ultima_fecha: '2026-11-24' },
  ]

  test('resume cuántas cerró cada quien, agrupando por registrado_por', async () => {
    prepararPool({ personas: PERSONAS })
    const { res, next } = await llamar(ctrl.porPersona, reqFalso())

    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(res.cuerpo).toMatchObject({ desde: PRIMERO, hasta: HOY })
    expect(res.cuerpo.personas.map(p => p.usuario)).toEqual(['TANA1', 'ASIS1'])
    expect(res.cuerpo.personas[0]).toMatchObject({ hechas: 40, omitidas: 0 })
    expect(sqlDe('personas')).toMatch(/FROM h360_lab_registro/i)
  })

  // `hechas` las cuenta todas, POR_EVENTO incluidas: mide trabajo hecho, no
  // cumplimiento. `por_evento` dice cuántas de esas no tenían día, que es lo que
  // impide leer el número como un porcentaje de cumplimiento por persona.
  test('separa cuántas de las cerradas eran POR_EVENTO y no da porcentaje por persona', async () => {
    prepararPool({ personas: PERSONAS })
    const { res } = await llamar(ctrl.porPersona, reqFalso())

    expect(res.cuerpo.personas[0]).toMatchObject({ hechas: 40, por_evento: 5 })
    expect(sqlDe('personas')).toMatch(/SUM\(g\.frecuencia = 'POR_EVENTO'\)/i)
    for (const p of res.cuerpo.personas)
      expect(Object.keys(p).some(k => /porcentaje/i.test(k))).toBe(false)
  })

  // Las omitidas salen de `h360_lab_tarea.cerrada_por`, que es donde queda quién
  // omitió: sin esto, quien pasó el mes omitiendo aparece con cero actividad.
  test('suma las omitidas de h360_lab_tarea.cerrada_por', async () => {
    prepararPool({
      personas: PERSONAS,
      omitidasPorPersona: [{ usuario: 'TANA1', omitidas: 3 }],
    })
    const { res } = await llamar(ctrl.porPersona, reqFalso())

    const tana = res.cuerpo.personas.find(p => p.usuario === 'TANA1')
    expect(tana).toMatchObject({ hechas: 40, omitidas: 3 })
    expect(sqlDe('omitidas')).toMatch(/FROM h360_lab_tarea/i)
    expect(sqlDe('omitidas')).toMatch(/t\.estado\s*=\s*'OMITIDA'/i)
  })

  // Quien solo omitió TIENE que aparecer: es justo el dato que una auditoría
  // mira, y si la lista se armara solo con los registros quedaría invisible.
  test('quien solo omitió aparece con hechas 0', async () => {
    prepararPool({
      personas: [],
      omitidasPorPersona: [{ usuario: 'ASIS9', omitidas: 6 }],
    })
    const { res } = await llamar(ctrl.porPersona, reqFalso())

    expect(res.cuerpo.personas).toEqual([
      expect.objectContaining({ usuario: 'ASIS9', hechas: 0, omitidas: 6 }),
    ])
  })

  // El cierre automático deja `cerrada_por = 'sistema'` con estado NO_HECHA. Al
  // filtrar por OMITIDA, «sistema» no entra en el informe de personas: no es
  // nadie a quien medir.
  test('no cuenta el cierre automático del sistema', async () => {
    prepararPool({ personas: [], omitidasPorPersona: [] })
    const { res } = await llamar(ctrl.porPersona, reqFalso())

    expect(res.cuerpo.personas).toEqual([])
    expect(sqlDe('omitidas')).not.toMatch(/NO_HECHA/)
  })

  // El período de las omitidas se filtra por `t.fecha` (DATE) y nunca por
  // `cerrada_at` (TIMESTAMP): en UTC, lo cerrado entre las 19:00 y la medianoche
  // de Cúcuta caería en el día siguiente y cruzaría el borde del mes.
  test('filtra las omitidas por t.fecha y no por cerrada_at', async () => {
    await llamar(ctrl.porPersona, reqFalso())

    const sql = sqlDe('omitidas')
    expect(sql).toMatch(/t\.fecha\s+BETWEEN/i)
    expect(sql).not.toMatch(/cerrada_at/)
  })

  test('las fechas salen con DATE_FORMAT y no hay TIMESTAMP', async () => {
    prepararPool({ personas: PERSONAS })
    const { res } = await llamar(ctrl.porPersona, reqFalso())

    const sql = sqlDe('personas')
    expect(sql).toMatch(/DATE_FORMAT\(\s*MIN\(g\.fecha_ejecucion\)\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).toMatch(/DATE_FORMAT\(\s*MAX\(g\.fecha_ejecucion\)\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).not.toMatch(/created_at|cerrada_at/)
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  test('un rango imposible da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.porPersona,
      reqFalso({ query: { desde: '2026-11-25', hasta: '2026-11-24' } }))

    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('filtra por laboratorio en las dos consultas', async () => {
    await llamar(ctrl.porPersona, reqFalso({ query: { laboratorio_id: '3' } }))

    expect(paramsDe('personas')).toEqual([PRIMERO, HOY, 3])
    expect(paramsDe('omitidas')).toEqual([PRIMERO, HOY, 3])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El historial paginado, que es lo que el frontend exporta a Excel
// ═══════════════════════════════════════════════════════════════════════════

describe('historial', () => {
  const REGISTRO = {
    id: 5, laboratorio_id: 1, regla_id: 3, tarea_id: 10,
    actividad_nombre: 'Instrumental', bloque: 'LABORATORIO',
    frecuencia: 'DIARIA', cada_dias: null, tipo_registro: 'CONFIRMACION',
    dias_atraso: 0, observaciones: null, registrado_por: 'TANA1',
    registrado_nombre: 'Tanatólogo', fecha_ejecucion: '2026-11-25',
    fecha_esperada: '2026-11-25', evidencias: 0,
  }

  test('devuelve data, total, page y limit; por defecto página 1 y tope 200', async () => {
    prepararPool({ registros: [REGISTRO], total: 1 })
    const { res, next } = await llamar(ctrl.historial, reqFalso())

    expect(next).not.toHaveBeenCalled()
    expect(res.cuerpo).toMatchObject({ data: [REGISTRO], total: 1, page: 1, limit: 200 })
    expect(paramsDe('historial')).toEqual([200, 0])
  })

  test('pagina con LIMIT ? OFFSET ? y calcula el salto desde la página', async () => {
    prepararPool({ registros: [], total: 320 })
    const { res } = await llamar(ctrl.historial, reqFalso({ query: { page: '3', limit: '50' } }))

    expect(sqlDe('historial')).toMatch(/LIMIT \? OFFSET \?/i)
    expect(paramsDe('historial')).toEqual([50, 100])
    expect(res.cuerpo).toMatchObject({ total: 320, page: 3, limit: 50 })
  })

  // El tope es lo que impide que una exportación de un año se traiga la tabla
  // entera en una sola respuesta. Se acota y se DICE en la respuesta: el
  // frontend lee `limit` y `total` para saber cuántas páginas pedir.
  test('un limit mayor que el tope se acota a 200 y la respuesta lo dice', async () => {
    prepararPool({ registros: [], total: 5000 })
    const { res } = await llamar(ctrl.historial, reqFalso({ query: { limit: '5000' } }))

    expect(paramsDe('historial')).toEqual([200, 0])
    expect(res.cuerpo.limit).toBe(200)
  })

  test('una página o un limit que no son números dan 400 y no consultan', async () => {
    for (const query of [{ page: 'x' }, { page: '0' }, { page: '-2' }, { limit: 'x' }, { limit: '0' }]) {
      db.query.mockClear()
      const { res } = await llamar(ctrl.historial, reqFalso({ query }))
      expect(res.codigo).toBe(400)
      expect(db.query).not.toHaveBeenCalled()
    }
  })

  test('filtra por laboratorio, rango, actividad, persona y frecuencia', async () => {
    prepararPool({ registros: [], total: 0 })
    await llamar(ctrl.historial, reqFalso({ query: {
      laboratorio_id: '1', desde: '2026-11-01', hasta: '2026-11-25',
      actividad: 'trampa', registrado_por: 'TANA1', frecuencia: 'diaria',
    } }))

    const sql = sqlDe('historial')
    expect(sql).toMatch(/g\.laboratorio_id = \?/)
    expect(sql).toMatch(/g\.fecha_ejecucion >= \?/)
    expect(sql).toMatch(/g\.fecha_ejecucion <= \?/)
    expect(sql).toMatch(/g\.actividad_nombre LIKE \?/)
    expect(sql).toMatch(/g\.registrado_por = \?/)
    expect(sql).toMatch(/g\.frecuencia = \?/)
    // La frecuencia se normaliza a mayúsculas contra el enum.
    expect(paramsDe('historial')).toEqual(
      [1, '2026-11-01', '2026-11-25', '%trampa%', 'TANA1', 'DIARIA', 200, 0])
  })

  test('una frecuencia que no está en el enum da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.historial, reqFalso({ query: { frecuencia: 'MENSUAL' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'frecuencia' })
    expect(db.query).not.toHaveBeenCalled()
  })

  // El total sale de un COUNT con EL MISMO WHERE y sin LIMIT: es lo que le dice
  // al frontend cuántas páginas pedir para el Excel. Si el COUNT llevara el
  // LIMIT, la exportación se cortaría en la primera página sin avisar.
  test('el total viene de un COUNT con el mismo WHERE y sin LIMIT', async () => {
    prepararPool({ registros: [], total: 412 })
    await llamar(ctrl.historial, reqFalso({ query: { laboratorio_id: '1', desde: '2026-11-01' } }))

    const sql = sqlDe('total')
    expect(sql).toMatch(/COUNT\(\*\) AS total/i)
    expect(sql).toMatch(/g\.laboratorio_id = \?/)
    expect(sql).toMatch(/g\.fecha_ejecucion >= \?/)
    expect(sql).not.toMatch(/LIMIT/i)
    expect(paramsDe('total')).toEqual([1, '2026-11-01'])
  })

  test('las fechas salen con DATE_FORMAT y no trae TIMESTAMP', async () => {
    prepararPool({ registros: [REGISTRO], total: 1 })
    const { res } = await llamar(ctrl.historial, reqFalso())

    const sql = sqlDe('historial')
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_ejecucion\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_esperada\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).not.toMatch(/created_at|updated_at/)
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  test('cuenta las evidencias desde la tabla del laboratorio', async () => {
    prepararPool({ registros: [], total: 0 })
    await llamar(ctrl.historial, reqFalso())
    expect(sqlDe('historial')).toMatch(/FROM h360_lab_evidencia/i)
  })

  test('una fecha que no existe da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.historial, reqFalso({ query: { hasta: '2026-02-31' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'hasta' })
    expect(db.query).not.toHaveBeenCalled()
  })

  // El historial NO acota el rango por defecto: sin `desde` trae lo más reciente
  // de toda la historia, que es lo que pide la pantalla al abrirse. El tope de
  // la página es lo que lo hace seguro.
  test('sin rango no inventa fechas en el WHERE', async () => {
    prepararPool({ registros: [], total: 0 })
    await llamar(ctrl.historial, reqFalso())

    expect(sqlDe('historial')).not.toMatch(/fecha_ejecucion >=/)
    expect(paramsDe('historial')).toEqual([200, 0])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Los fallos del pool no se tragan
// ═══════════════════════════════════════════════════════════════════════════

describe('los errores van a next', () => {
  test.each([['cumplimiento'], ['porPersona'], ['historial']])('%s escala el fallo del pool', async nombre => {
    db.query.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'))
    const { next } = await llamar(ctrl[nombre], reqFalso())
    expect(next).toHaveBeenCalledWith(expect.any(Error))
  })
})
