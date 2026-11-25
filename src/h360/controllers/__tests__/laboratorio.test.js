// Catálogo y tablero del laboratorio.
//
// Lo que se cuida acá, en orden de qué duele más si se rompe:
//
//  1. Que el tablero dispare el CIERRE y DESPUÉS la generación, los dos, antes
//     de consultar. Es la red de seguridad de que el cron de las 00:05 no haya
//     corrido. Sin el cierre, las diarias de ayer nunca pasan a NO_HECHA y el
//     informe de cumplimiento mentiría A FAVOR NUESTRO, que en una auditoría
//     sanitaria es el peor de los dos errores posibles. Con solo la generación
//     la pantalla se ve bien y el dato queda mal, que es la falla que no se
//     nota.
//  2. Que toda fecha que sale en una respuesta venga formateada en SQL. El pool
//     no tiene `dateStrings`: un DATE devuelto crudo sale como objeto, Express
//     lo serializa en UTC y en Colombia (UTC-5) la pantalla muestra el día
//     anterior.
//  3. Que `fecha_esperada` y `dias_atraso` se calculen en la consulta: la tabla
//     llama `fecha` a la primera y la segunda no existe como columna.
//  4. Que una regla mal formada se rechace con 400 ANTES de llegar a la base.
//     Los CHECK de h360_lab_regla la rechazarían igual, pero con un 500 de
//     MySQL sin explicación.
//  5. Que `puede_registrar` viaje en el dato, calculado del rol, para que el
//     frontend no repita la lista de roles. Y que `tanatologo` esté en ella:
//     es el rol nuevo de este módulo, no estaba en el de vehículos.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))

// El servicio se dobla para poder afirmar QUÉ se llamó y EN QUÉ ORDEN. Su
// comportamiento tiene su propia suite (services/__tests__/laboratorio.service),
// y acá lo que se prueba es el disparador, no la generación.
jest.mock('../../services/laboratorio.service', () => ({
  generarDia: jest.fn(async () => ({ creadas: 0, ya_existian: 0, arrastradas: 0 })),
  cerrarDiariasVencidas: jest.fn(async () => ({ cerradas: 0 })),
  ejecutarGeneracionDiaria: jest.fn(),
}))

// El servicio de evidencia es el MISMO del módulo de vehículos, reusado y no
// duplicado. Se dobla para poder afirmar a qué tabla se le pide escribir y que
// el rollback borra del disco lo que ya se había escrito.
//
// `servirEvidenciaDesde` es una fábrica y el controlador la llama al cargarse,
// así que el doble devuelve un handler con la tabla colgada como propiedad: el
// registro de llamadas lo borra `clearAllMocks` en el primer beforeEach, pero
// la propiedad del handler sobrevive.
jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  guardarEvidencias: jest.fn(),
  descartarEvidencias: jest.fn(),
  enviarEvidenciasADrive: jest.fn(),
  servirEvidenciaDesde: jest.fn(tabla => Object.assign(jest.fn(), { tabla })),
}))

const db   = require('../../config/db')
const svc  = require('../../services/laboratorio.service')
const evid = require('../../services/desinfeccionEvidencia.service')
const ctrl = require('../laboratorio.controller')

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

const COORD        = { usuario: 'COORD1', nombre: 'Coordinadora',  rol: 'coordinador' }
const TANATOLOGO   = { usuario: 'TANA1',  nombre: 'Tanatólogo',    rol: 'tanatologo' }
const CONTABILIDAD = { usuario: 'CONTA1', nombre: 'Contabilidad',  rol: 'contabilidad' }

function reqFalso({ body = {}, params = {}, query = {}, files, user = COORD } = {}) {
  return { body, params, query, files, user }
}

async function llamar(fn, req) {
  const res = resFalso()
  const next = jest.fn()
  await fn(req, res, next)
  return { res, next }
}

// ── El reloj ───────────────────────────────────────────────────────────────
//
// El instante se fija para que «hoy» no dependa del día en que se corran las
// pruebas. 2026-11-25 20:00 UTC son las 15:00 de Bogotá: el mismo día en las dos
// zonas, así que ninguna afirmación de acá se apoya en el corrimiento.
const fijarInstante = instante => jest.useFakeTimers({
  now: instante,
  doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate',
    'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
})
const INSTANTE   = new Date('2026-11-25T20:00:00Z')
const HOY        = '2026-11-25'   // miércoles
const LAB        = { id: 1, nombre: 'Laboratorio Los Olivos', sede: 'Cúcuta' }

// Las filas tal como las devuelve MySQL con las fechas YA formateadas por
// DATE_FORMAT, que es como llegan de verdad.
const TAREA_HOY = {
  tarea_id: 10, regla_id: 3, actividad: 'Barrer y trapear el piso',
  bloque: 'LABORATORIO', frecuencia: 'DIARIA', momento: 'CUALQUIERA',
  tipo_registro: 'CONFIRMACION', estado: 'PENDIENTE',
  fecha_esperada: '2026-11-25', dias_atraso: 0,
}

// La arrastrada: una quincenal de hace cuatro días que sigue pendiente. Es la
// razón de ser de `dias_atraso`; si el tablero trajera solo `t.fecha = ?` el
// campo valdría 0 siempre y no diría nada.
const TAREA_ATRASADA = {
  tarea_id: 11, regla_id: 7, actividad: 'Limpieza de la trampa de grasa',
  bloque: 'TRAMPA_GRASA', frecuencia: 'CADA_N_DIAS', momento: 'NOCHE',
  tipo_registro: 'CONFIRMACION', estado: 'PENDIENTE',
  fecha_esperada: '2026-11-21', dias_atraso: 4,
}

const EVENTO = {
  regla_id: 20, actividad: 'Recolección de bolsas de residuos peligrosos',
  bloque: 'OPERATIVA', tipo_registro: 'EVIDENCIA', hechas_hoy: 2,
}

/**
 * Pool falso enrutado por el alias que cada consulta expone, y no por el nombre
 * de la tabla: las tres consultas del tablero tocan h360_lab, así que enrutar
 * por tabla las confundiría. `pasos` guarda el orden real de todo lo que pasó.
 */
const pasos = []

function prepararPool({ labs = [LAB], tareas = [TAREA_ATRASADA, TAREA_HOY], eventos = [EVENTO] } = {}) {
  db.query.mockImplementation(async (sql, params) => {
    const s = String(sql)
    if (/AS fecha_esperada/i.test(s)) { pasos.push({ paso: 'tareas',     params }); return [tareas] }
    if (/AS hechas_hoy/i.test(s))     { pasos.push({ paso: 'por_evento', params }); return [eventos] }
    if (/FROM h360_lab\s+l/i.test(s)) { pasos.push({ paso: 'lab',        params }); return [labs] }
    pasos.push({ paso: 'otra', sql: s, params })
    return [[]]
  })
}

const soloPasos = () => pasos.map(p => p.paso)

beforeEach(() => {
  jest.clearAllMocks()
  pasos.length = 0
  fijarInstante(INSTANTE)
  svc.cerrarDiariasVencidas.mockImplementation(async () => { pasos.push({ paso: 'cerrar' }); return { cerradas: 0 } })
  svc.generarDia.mockImplementation(async () => { pasos.push({ paso: 'generar' }); return { creadas: 0, ya_existian: 0, arrastradas: 0 } })
  // Las dos son `async` de verdad, así que devuelven promesa: el controlador
  // les hace `.catch()` y un doble que devuelva `undefined` lo rompería por el
  // doble y no por el código.
  evid.guardarEvidencias.mockResolvedValue({ filas: [], rutasEscritas: [] })
  evid.descartarEvidencias.mockResolvedValue(undefined)
  prepararPool()
})

afterEach(() => { jest.useRealTimers() })

// ═══════════════════════════════════════════════════════════════════════════
// El disparador perezoso: lo que cubre que el cron no haya corrido
// ═══════════════════════════════════════════════════════════════════════════

describe('tablero — el segundo disparador', () => {
  test('cierra las diarias vencidas Y DESPUÉS genera el día, antes de consultar', async () => {
    const { res, next } = await llamar(ctrl.tablero, reqFalso())

    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)

    // Los DOS, no solo la generación: sin el cierre las diarias de ayer se
    // quedan PENDIENTE para siempre y el incumplimiento no se escribe nunca.
    expect(svc.cerrarDiariasVencidas).toHaveBeenCalledTimes(1)
    expect(svc.generarDia).toHaveBeenCalledTimes(1)

    // Y en ese orden, y las dos antes de leer las tareas. El orden completo
    // incluye la consulta del laboratorio, que va primero porque `generarDia`
    // necesita su id.
    expect(soloPasos()).toEqual(['lab', 'cerrar', 'generar', 'tareas', 'por_evento'])
  })

  test('el cierre se hace contra el «hoy» de Bogotá y la generación sobre el laboratorio', async () => {
    await llamar(ctrl.tablero, reqFalso())

    expect(svc.cerrarDiariasVencidas).toHaveBeenCalledWith(HOY)
    expect(svc.generarDia).toHaveBeenCalledWith(LAB.id, HOY)
  })

  // Mirar un día pasado es una lectura del histórico: no puede materializar
  // tareas con fecha de ese día, porque nacerían PENDIENTE y el cierre las
  // marcaría NO_HECHA, inventando incumplimientos de días en que el módulo no
  // existía.
  test('consultar una fecha pasada no genera tareas de esa fecha', async () => {
    await llamar(ctrl.tablero, reqFalso({ query: { fecha: '2026-11-20' } }))

    expect(svc.generarDia).toHaveBeenCalledWith(LAB.id, HOY)
    expect(svc.generarDia).not.toHaveBeenCalledWith(LAB.id, '2026-11-20')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Las fechas: formateadas en SQL, nunca recortadas en JS
// ═══════════════════════════════════════════════════════════════════════════

describe('tablero — las fechas', () => {
  test('las fechas de la respuesta son texto AAAA-MM-DD y no objetos Date', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso())

    expect(res.cuerpo.fecha).toBe(HOY)
    expect(typeof res.cuerpo.fecha).toBe('string')

    for (const t of res.cuerpo.hoy) {
      expect(typeof t.fecha_esperada).toBe('string')
      expect(t.fecha_esperada).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(t.fecha_esperada instanceof Date).toBe(false)
    }

    // Y lo que se serializa de verdad tampoco trae un Date escondido.
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  })

  // `fecha_esperada` no es una columna: la tabla la llama `fecha`. Y `dias_atraso`
  // no existe en h360_lab_tarea. Las dos se calculan en la consulta.
  test('fecha_esperada sale de DATE_FORMAT(t.fecha) y dias_atraso de DATEDIFF', async () => {
    await llamar(ctrl.tablero, reqFalso())

    const sql = db.query.mock.calls.map(c => String(c[0])).find(s => /AS fecha_esperada/i.test(s))
    expect(sql).toMatch(/DATE_FORMAT\(\s*t\.fecha\s*,\s*'%Y-%m-%d'\s*\)\s+AS fecha_esperada/i)
    expect(sql).toMatch(/DATEDIFF\(\s*\?\s*,\s*t\.fecha\s*\)\s+AS dias_atraso/i)
    // Y no hay ninguna fecha cruda en la lista de columnas.
    expect(sql).not.toMatch(/SELECT[\s\S]*?\bt\.fecha\s+AS/i)
  })

  // En el caso por defecto la fecha consultada ES hoy, así que el parámetro del
  // DATEDIFF es el mismo. La prueba sigue acá para fijar que lo recibe.
  test('por defecto el atraso se mide contra hoy, que es el día consultado', async () => {
    await llamar(ctrl.tablero, reqFalso())

    const consulta = pasos.find(p => p.paso === 'tareas')
    expect(consulta.params[0]).toBe(HOY)
  })

  // El atraso del TABLERO describe el día que se está mirando, no el de hoy. Si
  // se midiera contra hoy, una tarea del 20 que se hizo a tiempo ese día
  // aparecería con `dias_atraso: 5` al consultarla el 25, y el tablero del 20
  // diría que el laboratorio estaba cinco días atrasado cuando estaba al día.
  // El atraso REAL de lo ya ejecutado vive en `h360_lab_registro.dias_atraso`,
  // que se calcula contra la fecha esperada y no se recalcula nunca.
  test('el atraso se mide contra la fecha consultada y no contra hoy', async () => {
    await llamar(ctrl.tablero, reqFalso({ query: { fecha: '2026-11-20' } }))

    const consulta = pasos.find(p => p.paso === 'tareas')
    expect(consulta.params[0]).toBe('2026-11-20')
    expect(consulta.params).not.toContain(HOY)
  })

  test('una fecha que no existe se rechaza con 400 y no dispara nada', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso({ query: { fecha: '2026-02-31' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'fecha' })
    expect(svc.cerrarDiariasVencidas).not.toHaveBeenCalled()
    expect(svc.generarDia).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La forma de la respuesta
// ═══════════════════════════════════════════════════════════════════════════

describe('tablero — la respuesta', () => {
  test('trae fecha, laboratorio, la lista del día y las por evento', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso())

    expect(res.cuerpo.laboratorio).toEqual({ id: 1, nombre: LAB.nombre, sede: LAB.sede })
    expect(res.cuerpo.hoy).toHaveLength(2)
    expect(res.cuerpo.hoy[0]).toMatchObject({
      tarea_id: 11, regla_id: 7, actividad: 'Limpieza de la trampa de grasa',
      bloque: 'TRAMPA_GRASA', frecuencia: 'CADA_N_DIAS', momento: 'NOCHE',
      tipo_registro: 'CONFIRMACION', estado: 'PENDIENTE',
      fecha_esperada: '2026-11-21', dias_atraso: 4,
    })
  })

  // Las POR_EVENTO no tienen día, así que no están en h360_lab_tarea: salen de
  // la regla, con el conteo de lo registrado en el día que se mira.
  test('por_evento trae el conteo del día contado sobre el día consultado', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso())

    expect(res.cuerpo.por_evento).toEqual([{
      regla_id: 20, actividad: 'Recolección de bolsas de residuos peligrosos',
      bloque: 'OPERATIVA', tipo_registro: 'EVIDENCIA', hechas_hoy: 2,
    }])

    const consulta = pasos.find(p => p.paso === 'por_evento')
    expect(consulta.params).toContain(HOY)

    const sql = db.query.mock.calls.map(c => String(c[0])).find(s => /AS hechas_hoy/i.test(s))
    expect(sql).toMatch(/frecuencia\s*=\s*'POR_EVENTO'/i)
    expect(sql).toMatch(/fecha_ejecucion\s*=\s*\?/i)
  })

  test('las por evento de un día pasado se cuentan sobre ese día, no sobre hoy', async () => {
    await llamar(ctrl.tablero, reqFalso({ query: { fecha: '2026-11-20' } }))

    const consulta = pasos.find(p => p.paso === 'por_evento')
    expect(consulta.params).toContain('2026-11-20')
    expect(consulta.params).not.toContain(HOY)
  })

  test('el conteo llega como número aunque MySQL lo devuelva como texto', async () => {
    prepararPool({ eventos: [{ ...EVENTO, hechas_hoy: '3' }] })
    const { res } = await llamar(ctrl.tablero, reqFalso())

    expect(res.cuerpo.por_evento[0].hechas_hoy).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// puede_registrar: se calcula del rol y viaja en el dato
// ═══════════════════════════════════════════════════════════════════════════

describe('tablero — puede_registrar', () => {
  // El tanatólogo es el rol NUEVO de este módulo: el laboratorio es donde
  // trabaja y no estaba en el de vehículos. Si se cae de la lista, la persona
  // que hace el aseo ve el tablero y no puede registrar nada.
  test('es true para tanatologo', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso({ user: TANATOLOGO }))
    expect(res.cuerpo.puede_registrar).toBe(true)
  })

  // Contabilidad ve los informes, no ejecuta el aseo.
  test('es false para contabilidad', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso({ user: CONTABILIDAD }))
    expect(res.cuerpo.puede_registrar).toBe(false)
  })

  test('es true para los cinco roles que registran y false para el resto', async () => {
    for (const rol of ['tanatologo', 'asistente_tanatologo', 'asistente', 'coordinador', 'admin']) {
      const { res } = await llamar(ctrl.tablero, reqFalso({ user: { usuario: 'X', rol } }))
      expect([rol, res.cuerpo.puede_registrar]).toEqual([rol, true])
    }
    for (const rol of ['asesor', 'supervisora', 'contabilidad', '', undefined]) {
      const { res } = await llamar(ctrl.tablero, reqFalso({ user: { usuario: 'X', rol } }))
      expect([rol, res.cuerpo.puede_registrar]).toEqual([rol, false])
    }
  })

  test('sin usuario en la petición es false y no se cae', async () => {
    const { res, next } = await llamar(ctrl.tablero, { body: {}, params: {}, query: {} })
    expect(next).not.toHaveBeenCalled()
    expect(res.cuerpo.puede_registrar).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Qué laboratorio
// ═══════════════════════════════════════════════════════════════════════════

describe('tablero — el laboratorio', () => {
  test('sin laboratorio_id usa el activo', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso())
    expect(res.cuerpo.laboratorio.id).toBe(1)
    expect(pasos[0].paso).toBe('lab')
  })

  test('un laboratorio_id que no existe devuelve 404 y no dispara nada', async () => {
    prepararPool({ labs: [] })
    const { res } = await llamar(ctrl.tablero, reqFalso({ query: { laboratorio_id: '9' } }))

    expect(res.codigo).toBe(404)
    expect(svc.generarDia).not.toHaveBeenCalled()
    expect(svc.cerrarDiariasVencidas).not.toHaveBeenCalled()
  })

  test('sin laboratorios activos devuelve 404 en vez de un tablero vacío', async () => {
    prepararPool({ labs: [] })
    const { res } = await llamar(ctrl.tablero, reqFalso())

    expect(res.codigo).toBe(404)
    expect(svc.generarDia).not.toHaveBeenCalled()
  })

  test('un laboratorio_id inválido se rechaza con 400', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso({ query: { laboratorio_id: 'abc' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'laboratorio_id' })
  })

  test('un fallo de la base no se traga: va a next', async () => {
    db.query.mockRejectedValue(new Error('fallo simulado de base'))
    const { next } = await llamar(ctrl.tablero, reqFalso())
    expect(next).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Reglas: la validación que el CHECK impone y que acá se adelanta
// ═══════════════════════════════════════════════════════════════════════════

describe('crearRegla — lo que el CHECK impone', () => {
  const base = { actividad_id: 3, laboratorio_id: 1, frecuencia: 'DIARIA' }

  // El CHECK ck_lab_regla_dia_semana la rechazaría igual, pero con un 500 de
  // MySQL que no dice qué falta. Y una SEMANAL sin día es justo el estado en que
  // el generador no sabe qué hacer y la actividad desaparece del tablero sin que
  // nadie lo note.
  test('una SEMANAL sin dia_semana se rechaza con 400 y no llega a la base', async () => {
    const { res, next } = await llamar(ctrl.crearRegla,
      reqFalso({ body: { ...base, frecuencia: 'SEMANAL' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'dia_semana' })
    expect(next).not.toHaveBeenCalled()
    expect(db.query).not.toHaveBeenCalled()
  })

  test('una SEMANAL con dia_semana fuera de 1..7 se rechaza con 400', async () => {
    for (const dia of [0, 8, -1, 3.5, 'sábado', null]) {
      jest.clearAllMocks()
      const { res } = await llamar(ctrl.crearRegla,
        reqFalso({ body: { ...base, frecuencia: 'SEMANAL', dia_semana: dia } }))
      expect([dia, res.codigo]).toEqual([dia, 400])
      expect(db.query).not.toHaveBeenCalled()
    }
  })

  test('una CADA_N_DIAS necesita cada_dias >= 2', async () => {
    for (const cada of [undefined, 0, 1, -5, 'quince']) {
      jest.clearAllMocks()
      const { res } = await llamar(ctrl.crearRegla,
        reqFalso({ body: { ...base, frecuencia: 'CADA_N_DIAS', cada_dias: cada } }))
      expect([cada, res.codigo]).toEqual([cada, 400])
      expect(res.cuerpo).toMatchObject({ campo: 'cada_dias' })
      expect(db.query).not.toHaveBeenCalled()
    }
  })

  test('una frecuencia que no está en el enum se rechaza con 400', async () => {
    const { res } = await llamar(ctrl.crearRegla,
      reqFalso({ body: { ...base, frecuencia: 'CUANDO_SE_ACUERDEN' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'frecuencia' })
    expect(db.query).not.toHaveBeenCalled()
  })

  // DIARIA y POR_EVENTO los llevan en NULL: el CHECK las rechaza con valor.
  test('una DIARIA guarda cada_dias y dia_semana en NULL aunque lleguen con valor', async () => {
    db.query.mockImplementation(async sql => {
      const s = String(sql)
      if (/^INSERT/i.test(s.trim()))          return [{ insertId: 77, affectedRows: 1 }]
      if (/FROM h360_lab_actividad a/i.test(s)) return [[{ id: 3, nombre: 'Barrer', bloque: 'LABORATORIO', activo: 1 }]]
      if (/FROM h360_lab\s+l/i.test(s))       return [[LAB]]
      return [[]]
    })

    const { res } = await llamar(ctrl.crearRegla,
      reqFalso({ body: { ...base, cada_dias: 15, dia_semana: 6 } }))

    expect(res.codigo).toBe(201)
    const insert = db.query.mock.calls.find(c => /^INSERT/i.test(String(c[0]).trim()))
    expect(insert[1]).toContain(null)
    expect(insert[1]).not.toContain(15)
    expect(insert[1]).not.toContain(6)
  })

  test('una SEMANAL bien formada se inserta con su día', async () => {
    db.query.mockImplementation(async sql => {
      const s = String(sql)
      if (/^INSERT/i.test(s.trim()))            return [{ insertId: 78, affectedRows: 1 }]
      if (/FROM h360_lab_actividad a/i.test(s)) return [[{ id: 3, nombre: 'Trampa', bloque: 'TRAMPA_GRASA', activo: 1 }]]
      if (/FROM h360_lab\s+l/i.test(s))         return [[LAB]]
      return [[]]
    })

    const { res } = await llamar(ctrl.crearRegla,
      reqFalso({ body: { ...base, frecuencia: 'SEMANAL', dia_semana: 6 } }))

    expect(res.codigo).toBe(201)
    const insert = db.query.mock.calls.find(c => /^INSERT/i.test(String(c[0]).trim()))
    expect(insert[1]).toContain(6)
  })

  test('si la actividad no existe devuelve 404 y no inserta', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM h360_lab\s+l/i.test(String(sql))) return [[LAB]]
      return [[]]
    })
    const { res } = await llamar(ctrl.crearRegla, reqFalso({ body: base }))

    expect(res.codigo).toBe(404)
    expect(db.query.mock.calls.some(c => /^INSERT/i.test(String(c[0]).trim()))).toBe(false)
  })
})

describe('actualizarRegla', () => {
  const REGLA = {
    id: 5, actividad_id: 3, laboratorio_id: 1, actividad: 'Trampa de grasa',
    bloque: 'TRAMPA_GRASA', frecuencia: 'CADA_N_DIAS', cada_dias: 15,
    dia_semana: null, momento: 'NOCHE', tipo_registro: 'CONFIRMACION', activo: 1,
  }

  const prepararRegla = (regla = REGLA) => db.query.mockImplementation(async sql => {
    const s = String(sql)
    if (/FROM h360_lab_regla r/i.test(s) && /^SELECT/i.test(s.trim())) return [regla ? [regla] : []]
    return [{ affectedRows: 1 }]
  })

  // Pasar a SEMANAL sin decir qué día deja la regla en el estado que el CHECK
  // rechaza; y si el CHECK no estuviera, la actividad desaparecería del tablero.
  test('pasar a SEMANAL sin dia_semana se rechaza con 400 y no escribe', async () => {
    prepararRegla()
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: { frecuencia: 'SEMANAL' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'dia_semana' })
    expect(db.query.mock.calls.some(c => /^UPDATE/i.test(String(c[0]).trim()))).toBe(false)
  })

  // Cambiar la frecuencia tiene que limpiar el campo de la anterior: una regla
  // SEMANAL con `cada_dias` puesto es otra fila que el CHECK rechaza.
  test('pasar de CADA_N_DIAS a SEMANAL pone cada_dias en NULL', async () => {
    prepararRegla()
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: { frecuencia: 'SEMANAL', dia_semana: 6 } }))

    expect(res.codigo).toBe(200)
    const update = db.query.mock.calls.find(c => /^UPDATE/i.test(String(c[0]).trim()))
    expect(update[1][0]).toMatchObject({ frecuencia: 'SEMANAL', dia_semana: 6, cada_dias: null })
  })

  test('bajar cada_dias a 1 sobre una CADA_N_DIAS existente se rechaza con 400', async () => {
    prepararRegla()
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: { cada_dias: 1 } }))

    expect(res.codigo).toBe(400)
    expect(db.query.mock.calls.some(c => /^UPDATE/i.test(String(c[0]).trim()))).toBe(false)
  })

  // Las tareas apuntan a la regla: moverla de actividad reinterpretaría en
  // silencio toda la historia que ya está escrita.
  test('no mueve la regla de actividad ni de laboratorio', async () => {
    prepararRegla()
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: { actividad_id: 9, laboratorio_id: 2, momento: 'CUALQUIERA' } }))

    expect(res.codigo).toBe(200)
    const update = db.query.mock.calls.find(c => /^UPDATE/i.test(String(c[0]).trim()))
    expect(update[1][0]).toEqual({ momento: 'CUALQUIERA' })
  })

  test('una regla que no existe devuelve 404', async () => {
    prepararRegla(null)
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: { activo: 0 } }))
    expect(res.codigo).toBe(404)
  })

  test('un cuerpo sin nada que cambiar devuelve 400', async () => {
    prepararRegla()
    const { res } = await llamar(ctrl.actualizarRegla,
      reqFalso({ params: { id: '5' }, body: {} }))
    expect(res.codigo).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Catálogo
// ═══════════════════════════════════════════════════════════════════════════

describe('listarLaboratorios', () => {
  test('devuelve la lista y no expone ninguna fecha cruda', async () => {
    db.query.mockResolvedValue([[{ ...LAB, activo: 1, reglas: 23 }]])
    const { res } = await llamar(ctrl.listarLaboratorios, reqFalso())

    expect(res.cuerpo).toHaveLength(1)
    const sql = String(db.query.mock.calls[0][0])
    expect(sql).not.toMatch(/created_at|updated_at/)
  })

  test('?activo=1 filtra por activo', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarLaboratorios, reqFalso({ query: { activo: '1' } }))

    expect(String(db.query.mock.calls[0][0])).toMatch(/l\.activo = \?/)
    expect(db.query.mock.calls[0][1]).toEqual([1])
  })
})

describe('listarActividades', () => {
  test('trae el bloque y el conteo de reglas', async () => {
    db.query.mockResolvedValue([[{ id: 1, nombre: 'Barrer', bloque: 'LABORATORIO', descripcion: null, activo: 1, reglas: 1 }]])
    const { res } = await llamar(ctrl.listarActividades, reqFalso())

    expect(res.cuerpo[0]).toMatchObject({ bloque: 'LABORATORIO', reglas: 1 })
    const sql = String(db.query.mock.calls[0][0])
    expect(sql).toMatch(/h360_lab_actividad/)
    expect(sql).not.toMatch(/created_at|updated_at/)
  })

  test('?bloque= filtra, y un bloque que no está en el enum da 400', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarActividades, reqFalso({ query: { bloque: 'trampa_grasa' } }))
    expect(db.query.mock.calls[0][1]).toEqual(['TRAMPA_GRASA'])

    jest.clearAllMocks()
    const { res } = await llamar(ctrl.listarActividades, reqFalso({ query: { bloque: 'COCINA' } }))
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('crearActividad', () => {
  test('exige nombre y bloque', async () => {
    const sinNombre = await llamar(ctrl.crearActividad, reqFalso({ body: { bloque: 'LABORATORIO' } }))
    expect(sinNombre.res.codigo).toBe(400)
    expect(sinNombre.res.cuerpo).toMatchObject({ campo: 'nombre' })

    jest.clearAllMocks()
    const sinBloque = await llamar(ctrl.crearActividad, reqFalso({ body: { nombre: 'Barrer' } }))
    expect(sinBloque.res.codigo).toBe(400)
    expect(sinBloque.res.cuerpo).toMatchObject({ campo: 'bloque' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('crea y devuelve 201', async () => {
    db.query.mockImplementation(async sql => {
      const s = String(sql)
      if (/^INSERT/i.test(s.trim())) return [{ insertId: 42, affectedRows: 1 }]
      if (/WHERE a\.id = \?/i.test(s)) return [[{ id: 42, nombre: 'Barrer', bloque: 'LABORATORIO', descripcion: null, activo: 1 }]]
      return [[]]
    })
    const { res } = await llamar(ctrl.crearActividad,
      reqFalso({ body: { nombre: 'Barrer', bloque: 'LABORATORIO' } }))

    expect(res.codigo).toBe(201)
    expect(res.cuerpo).toMatchObject({ id: 42, bloque: 'LABORATORIO' })
  })

  test('un nombre repetido devuelve 409 y no inserta', async () => {
    db.query.mockImplementation(async sql => {
      if (/^SELECT id FROM h360_lab_actividad/i.test(String(sql).trim())) return [[{ id: 7 }]]
      return [[]]
    })
    const { res } = await llamar(ctrl.crearActividad,
      reqFalso({ body: { nombre: 'Barrer', bloque: 'LABORATORIO' } }))

    expect(res.codigo).toBe(409)
    expect(db.query.mock.calls.some(c => /^INSERT/i.test(String(c[0]).trim()))).toBe(false)
  })

  test('una carrera contra la UNIQUE se traduce a 409 y no a 500', async () => {
    const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' })
    db.query.mockImplementation(async sql => {
      if (/^INSERT/i.test(String(sql).trim())) throw dup
      return [[]]
    })
    const { res, next } = await llamar(ctrl.crearActividad,
      reqFalso({ body: { nombre: 'Barrer', bloque: 'LABORATORIO' } }))

    expect(res.codigo).toBe(409)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('actualizarActividad', () => {
  const ACT = { id: 3, nombre: 'Barrer', bloque: 'LABORATORIO', descripcion: null, activo: 1 }

  test('cambia el bloque y devuelve la actividad', async () => {
    db.query.mockImplementation(async sql => {
      const s = String(sql)
      if (/WHERE a\.id = \?/i.test(s)) return [[{ ...ACT, bloque: 'OPERATIVA' }]]
      return [{ affectedRows: 1 }]
    })
    const { res } = await llamar(ctrl.actualizarActividad,
      reqFalso({ params: { id: '3' }, body: { bloque: 'operativa' } }))

    expect(res.codigo).toBe(200)
    const update = db.query.mock.calls.find(c => /^UPDATE/i.test(String(c[0]).trim()))
    expect(update[1][0]).toEqual({ bloque: 'OPERATIVA' })
  })

  test('un bloque fuera del enum se rechaza con 400 y no escribe', async () => {
    db.query.mockImplementation(async sql => {
      if (/WHERE a\.id = \?/i.test(String(sql))) return [[ACT]]
      return [{ affectedRows: 1 }]
    })
    const { res } = await llamar(ctrl.actualizarActividad,
      reqFalso({ params: { id: '3' }, body: { bloque: 'COCINA' } }))

    expect(res.codigo).toBe(400)
    expect(db.query.mock.calls.some(c => /^UPDATE/i.test(String(c[0]).trim()))).toBe(false)
  })

  test('un id inválido devuelve 400 sin tocar la base', async () => {
    const { res } = await llamar(ctrl.actualizarActividad,
      reqFalso({ params: { id: '0' }, body: { activo: 0 } }))
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('listarReglas', () => {
  test('filtra por laboratorio, actividad, frecuencia y activo', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarReglas, reqFalso({
      query: { laboratorio_id: '1', actividad_id: '3', frecuencia: 'semanal', activo: '1' },
    }))

    const [sql, params] = db.query.mock.calls[0]
    expect(String(sql)).toMatch(/r\.laboratorio_id = \?/)
    expect(String(sql)).toMatch(/r\.frecuencia = \?/)
    expect(params).toEqual([1, 3, 'SEMANAL', 1])
  })

  test('una frecuencia fuera del enum da 400', async () => {
    const { res } = await llamar(ctrl.listarReglas, reqFalso({ query: { frecuencia: 'MENSUAL' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'frecuencia' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('no expone ninguna fecha cruda', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarReglas, reqFalso())
    expect(String(db.query.mock.calls[0][0])).not.toMatch(/created_at|updated_at/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Registrar y omitir
//
// Lo que se cuida acá, en orden de qué duele más si se rompe:
//
//  1. Que lo que se puede rechazar se rechace ANTES de abrir la transacción. Una
//     foto ya escrita en disco por un registro que no existe es basura que nadie
//     limpia, y en este disco `uploads/` ya pesa 8,4 GB.
//  2. Que lo que se escribió a medias se deshaga en la base Y en el disco. Si la
//     transacción se cae después de guardar las fotos y nadie llama a
//     `descartarEvidencias`, los archivos quedan huérfanos para siempre.
//  3. Que el registro COPIE la regla vigente y no apunte a ella: cambiar una
//     frecuencia en abril no puede reescribir lo que se cumplió en marzo.
//  4. Que la validación sea contra la REGLA LEÍDA DE LA BASE y nunca contra lo
//     que mande el cliente. Si el cuerpo pudiera decir «esto es CONFIRMACION»,
//     la actividad que exige foto se cerraría sin foto y la evidencia sanitaria
//     dejaría de existir sin que nada se vea raro.
//  5. Que omitir exija motivo. Sin motivo obligatorio la gente omite para que el
//     indicador no se ponga rojo y el dato deja de servir para la auditoría.
//  6. Que la evidencia del laboratorio vaya a LA TABLA DEL LABORATORIO. El
//     servicio es el mismo de vehículos; sin decirle la tabla, la foto queda
//     colgada del registro de un vehículo con el mismo id.
// ═══════════════════════════════════════════════════════════════════════════

// Las filas tal como las devuelve MySQL, con las fechas YA formateadas.
const TAREA_ABIERTA = {
  tarea_id: 10, laboratorio_id: 1, regla_id: 3, estado: 'PENDIENTE',
  fecha_esperada: '2026-11-23',
  frecuencia: 'CADA_N_DIAS', cada_dias: 15, tipo_registro: 'CONFIRMACION',
  actividad: 'Limpieza de la trampa de grasa', bloque: 'TRAMPA_GRASA',
}

// La que exige foto: una de las tres marcadas EVID en la especificación.
const TAREA_CON_FOTO = {
  ...TAREA_ABIERTA, tarea_id: 12, regla_id: 8,
  estado: 'PENDIENTE', fecha_esperada: HOY,
  frecuencia: 'DIARIA', cada_dias: null, tipo_registro: 'EVIDENCIA',
  actividad: 'Recipiente de residuos anatomopatológicos', bloque: 'OPERATIVA',
}

// Las POR_EVENTO no tienen día y no están en h360_lab_tarea: se registran
// contra la regla.
const REGLA_EVENTO = {
  regla_id: 20, laboratorio_id: 1, activo: 1,
  frecuencia: 'POR_EVENTO', cada_dias: null, tipo_registro: 'EVIDENCIA',
  actividad: 'Recolección de bolsas de residuos peligrosos', bloque: 'OPERATIVA',
}

const REGISTRO_GUARDADO = {
  id: 900, laboratorio_id: 1, regla_id: 3, tarea_id: 10,
  actividad_nombre: 'Limpieza de la trampa de grasa', bloque: 'TRAMPA_GRASA',
  frecuencia: 'CADA_N_DIAS', cada_dias: 15, tipo_registro: 'CONFIRMACION',
  fecha_ejecucion: HOY, fecha_esperada: '2026-11-23', dias_atraso: 2,
  observaciones: null, registrado_por: 'COORD1', registrado_nombre: 'Coordinadora',
  evidencias: 0,
}

const foto = (nombre = 'IMG_1.jpg') =>
  ({ originalname: nombre, mimetype: 'image/jpeg', buffer: Buffer.from('foto') })

/**
 * Conexión de transacción simulada. Guarda lo que se escribió para poder
 * afirmar sobre los INSERT y los UPDATE, y permite hacer fallar una consulta a
 * propósito.
 */
function connDoble({ fallaEn = null, cierre = 1 } = {}) {
  const c = {
    consultas: [],
    commits: 0, rollbacks: 0, liberada: false,
    beginTransaction: jest.fn(async () => { c.consultas.push({ sql: 'BEGIN' }) }),
    commit:   jest.fn(async () => { c.commits++ }),
    rollback: jest.fn(async () => { c.rollbacks++ }),
    release:  jest.fn(() => { c.liberada = true }),
  }
  c.query = jest.fn(async (sql, params) => {
    const s = String(sql)
    c.consultas.push({ sql: s, params })
    if (fallaEn && new RegExp(fallaEn, 'i').test(s)) throw new Error('fallo simulado de base')
    if (/^INSERT/i.test(s.trim())) return [{ insertId: 900, affectedRows: 1 }]
    if (/^UPDATE/i.test(s.trim())) return [{ affectedRows: cierre }]
    return [[]]
  })
  c.consultaCon = patron => c.consultas.find(q => new RegExp(patron, 'i').test(q.sql))
  return c
}

/**
 * Pool falso para los caminos de escritura, enrutado por la tabla de cada
 * consulta. `tarea` y `regla` son lo que devuelve la lectura previa a la
 * transacción; `null` significa «no existe».
 */
function prepararEscritura({ tarea = TAREA_ABIERTA, regla = null, registro = REGISTRO_GUARDADO } = {}) {
  db.query.mockImplementation(async (sql, params) => {
    const s = String(sql)
    if (/FROM h360_lab_tarea t/i.test(s))    { pasos.push({ paso: 'tarea',    params }); return [tarea ? [tarea] : []] }
    if (/FROM h360_lab_registro g/i.test(s)) { pasos.push({ paso: 'registro', params }); return [registro ? [registro] : []] }
    if (/FROM h360_lab_regla r/i.test(s))    { pasos.push({ paso: 'regla',    params }); return [regla ? [regla] : []] }
    pasos.push({ paso: 'otra', sql: s, params })
    return [[]]
  })
}

const insertRegistro = conn => conn.consultaCon('INSERT INTO h360_lab_registro')
/** Los parámetros del INSERT, por nombre de columna, para no contar posiciones. */
function columnasDelRegistro(conn) {
  const q = insertRegistro(conn)
  const nombres = /\(([^)]*)\)\s*VALUES/i.exec(q.sql)[1].split(',').map(x => x.trim())
  return Object.fromEntries(nombres.map((n, i) => [n, q.params[i]]))
}

describe('registrar — lo que se rechaza antes de abrir la transacción', () => {
  // Es la regla de la BASE la que exige la foto. Si no hay foto no hay
  // evidencia sanitaria, y rechazarlo después de abrir la transacción es
  // escribir para después borrar.
  test('una actividad de EVIDENCIA sin fotos da 400 y la transacción nunca se abre', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    const { res, next } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 12 } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'evidencia' })
    expect(next).not.toHaveBeenCalled()
    expect(db.getConnection).not.toHaveBeenCalled()
    expect(evid.guardarEvidencias).not.toHaveBeenCalled()
  })

  // El `tipo_registro` que importa es el de la tabla. Si el cuerpo pudiera
  // bajarlo a CONFIRMACION, la actividad que exige foto se cerraría sin foto.
  test('el tipo_registro del cuerpo no baja la exigencia de la regla', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 12, tipo_registro: 'CONFIRMACION' } }))

    expect(res.codigo).toBe(400)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  // Y tampoco la sube: una CONFIRMACION se cierra sin foto aunque el cuerpo
  // diga otra cosa.
  test('el tipo_registro del cuerpo tampoco inventa una exigencia que la regla no tiene', async () => {
    prepararEscritura()
    db.getConnection.mockResolvedValue(connDoble())
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10, tipo_registro: 'EVIDENCIA' } }))

    expect(res.codigo).toBe(201)
  })

  // Cerrar dos veces la misma tarea dejaría dos registros de una ejecución y el
  // informe contaría doble.
  test('una tarea ya cerrada da 409 y no abre la transacción', async () => {
    for (const estado of ['HECHA', 'OMITIDA', 'NO_HECHA']) {
      jest.clearAllMocks()
      prepararEscritura({ tarea: { ...TAREA_ABIERTA, estado } })
      const { res } = await llamar(ctrl.registrar,
        reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

      expect([estado, res.codigo]).toEqual([estado, 409])
      expect(db.getConnection).not.toHaveBeenCalled()
    }
  })

  test('una tarea de otro laboratorio da 400 y no abre la transacción', async () => {
    prepararEscritura({ tarea: { ...TAREA_ABIERTA, laboratorio_id: 2 } })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'tarea_id' })
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('una tarea que no existe da 404', async () => {
    prepararEscritura({ tarea: null })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 99 } }))

    expect(res.codigo).toBe(404)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('sin laboratorio_id da 400 y no toca la base', async () => {
    const { res } = await llamar(ctrl.registrar, reqFalso({ body: { tarea_id: 10 } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'laboratorio_id' })
    expect(db.query).not.toHaveBeenCalled()
  })

  // Sin tarea y sin regla no hay nada contra lo que registrar.
  test('sin tarea_id y sin regla_id da 400', async () => {
    const { res } = await llamar(ctrl.registrar, reqFalso({ body: { laboratorio_id: 1 } }))
    expect(res.codigo).toBe(400)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  // Una ejecución futura adelantaría el ancla de las quincenales y el tablero
  // diría que está al día algo que nadie hizo.
  test('una fecha de ejecución futura da 400', async () => {
    prepararEscritura()
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10, fecha_ejecucion: '2026-11-26' } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'fecha_ejecucion' })
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('una fecha de ejecución que no existe da 400', async () => {
    prepararEscritura()
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10, fecha_ejecucion: '2026-02-31' } }))

    expect(res.codigo).toBe(400)
    expect(db.getConnection).not.toHaveBeenCalled()
  })
})

describe('registrar — el registro copia la regla vigente', () => {
  // Copia y no apunta: cambiar la frecuencia en abril no puede reescribir lo
  // que se cumplió en marzo. Es la misma razón que en h360_desinf_registro.
  test('copia actividad, bloque, frecuencia, cada_dias y tipo_registro de la base', async () => {
    prepararEscritura()
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10, observaciones: 'Se raspó la trampa' } }))

    expect(res.codigo).toBe(201)
    expect(columnasDelRegistro(conn)).toMatchObject({
      laboratorio_id:   1,
      regla_id:         3,
      tarea_id:         10,
      actividad_nombre: 'Limpieza de la trampa de grasa',
      bloque:           'TRAMPA_GRASA',
      frecuencia:       'CADA_N_DIAS',
      cada_dias:        15,
      tipo_registro:    'CONFIRMACION',
      observaciones:    'Se raspó la trampa',
      registrado_por:   'COORD1',
    })
  })

  // Lo que manda el cliente en estos campos se ignora: si se copiara del
  // cuerpo, el histórico sería lo que diga el frontend y no lo que regía.
  test('la frecuencia y el tipo del cuerpo se ignoran', async () => {
    prepararEscritura()
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({ body: {
      laboratorio_id: 1, tarea_id: 10,
      frecuencia: 'DIARIA', cada_dias: 1, tipo_registro: 'EVIDENCIA',
      actividad_nombre: 'Otra cosa', bloque: 'LABORATORIO',
    } }))

    expect(columnasDelRegistro(conn)).toMatchObject({
      frecuencia: 'CADA_N_DIAS', cada_dias: 15, tipo_registro: 'CONFIRMACION',
      actividad_nombre: 'Limpieza de la trampa de grasa', bloque: 'TRAMPA_GRASA',
    })
  })

  // El atraso se calcula contra la fecha ESPERADA de la tarea y se guarda: es
  // el dato del informe y no se vuelve a calcular nunca.
  test('dias_atraso se mide contra la fecha esperada de la tarea', async () => {
    prepararEscritura()
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    // Esperada el 23, ejecutada hoy 25: dos días tarde.
    expect(columnasDelRegistro(conn)).toMatchObject({
      fecha_esperada: '2026-11-23', fecha_ejecucion: HOY, dias_atraso: 2,
    })
  })

  test('hacerla antes de la fecha esperada deja dias_atraso negativo', async () => {
    prepararEscritura({ tarea: { ...TAREA_ABIERTA, fecha_esperada: '2026-11-28' } })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))
    expect(columnasDelRegistro(conn).dias_atraso).toBe(-3)
  })

  // La tarea se cierra con el estado y el registro que la cerró, y el UPDATE
  // repite `estado = 'PENDIENTE'` en el WHERE: si alguien la cerró entre la
  // lectura y la escritura, el cierre no la pisa.
  test('cierra la tarea a HECHA apuntando al registro, y solo si seguía PENDIENTE', async () => {
    prepararEscritura()
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    expect(res.codigo).toBe(201)
    const upd = conn.consultaCon('UPDATE h360_lab_tarea')
    expect(upd.sql).toMatch(/estado\s*=\s*'HECHA'/i)
    expect(upd.sql).toMatch(/estado\s*=\s*'PENDIENTE'/i)   // el guardia del WHERE
    expect(upd.params).toEqual([900, 'COORD1', 10])
    expect(conn.commits).toBe(1)
    expect(conn.liberada).toBe(true)
  })

  // Si el guardia no encontró la fila, alguien la cerró mientras se escribía:
  // se deshace todo en vez de dejar un registro de una tarea cerrada por otro.
  test('si la tarea se cerró en el medio, deshace y devuelve 409', async () => {
    prepararEscritura()
    const conn = connDoble({ cierre: 0 })
    db.getConnection.mockResolvedValue(conn)

    const { res, next } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    expect(res.codigo).toBe(409)
    expect(next).not.toHaveBeenCalled()
    expect(conn.commits).toBe(0)
    expect(conn.rollbacks).toBe(1)
    expect(conn.liberada).toBe(true)
  })
})

describe('registrar — el camino POR_EVENTO', () => {
  // No tiene día: no hay tarea que cerrar ni fecha contra la que medir atraso.
  // Inventar una fecha esperada sería inventar un incumplimiento.
  test('sin tarea_id deja tarea_id y fecha_esperada en NULL', async () => {
    prepararEscritura({ tarea: null, regla: REGLA_EVENTO })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({ body: {
      laboratorio_id: 1, regla_id: 20, observaciones: 'Entrega a la empresa de residuos',
    }, files: [foto()] }))

    expect(res.codigo).toBe(201)
    const cols = columnasDelRegistro(conn)
    expect(cols.tarea_id).toBeNull()
    expect(cols.fecha_esperada).toBeNull()
    expect(cols.dias_atraso).toBeNull()
    expect(cols).toMatchObject({ frecuencia: 'POR_EVENTO', tipo_registro: 'EVIDENCIA' })

    // Y no se toca ninguna tarea: no hay ninguna suya.
    expect(conn.consultaCon('UPDATE h360_lab_tarea')).toBeUndefined()
    expect(res.cuerpo.tarea).toBeNull()
  })

  test('una regla POR_EVENTO de tipo EVIDENCIA sin fotos da 400', async () => {
    prepararEscritura({ tarea: null, regla: REGLA_EVENTO })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, regla_id: 20 } }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'evidencia' })
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  // Una DIARIA registrada sin su tarea dejaría la tarea PENDIENTE: el cierre la
  // pasaría a NO_HECHA y el informe diría que no se hizo algo que sí se hizo, con
  // el registro al lado para contradecirlo.
  test('una regla que no es POR_EVENTO exige su tarea_id', async () => {
    prepararEscritura({ tarea: null, regla: { ...REGLA_EVENTO, frecuencia: 'DIARIA' } })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, regla_id: 20 }, files: [foto()] }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'tarea_id' })
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('una regla de otro laboratorio da 400', async () => {
    prepararEscritura({ tarea: null, regla: { ...REGLA_EVENTO, laboratorio_id: 2 } })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, regla_id: 20 }, files: [foto()] }))

    expect(res.codigo).toBe(400)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('una regla que no existe da 404', async () => {
    prepararEscritura({ tarea: null, regla: null })
    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, regla_id: 20 }, files: [foto()] }))

    expect(res.codigo).toBe(404)
  })
})

describe('registrar — la transacción y las fotos', () => {
  test('la evidencia va a la tabla del laboratorio, no a la de vehículos', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evid.guardarEvidencias.mockResolvedValue({
      filas: [{ id: 5, ruta: '2026/11/foto.jpg' }], rutasEscritas: ['/datos/2026/11/foto.jpg'],
    })

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { laboratorio_id: 1, tarea_id: 12 }, files: [foto(), foto('IMG_2.jpg')],
    }))

    expect(res.codigo).toBe(201)
    expect(evid.guardarEvidencias).toHaveBeenCalledTimes(1)
    const args = evid.guardarEvidencias.mock.calls[0][0]
    expect(args.tabla).toBe('h360_lab_evidencia')
    // Con la conexión de la transacción, no con el pool: las filas tienen que
    // deshacerse con el resto si algo falla después.
    expect(args.conn).toBe(conn)
    expect(args.registroId).toBe(900)
    expect(args.archivos).toHaveLength(2)
    expect(args.fechaEjecucion).toBe(HOY)
    expect(args.actividadNombre).toBe(TAREA_CON_FOTO.actividad)
    // Las filas recién escritas viajan en la respuesta para que la pantalla
    // pinte las miniaturas sin volver a pedir el registro.
    expect(res.cuerpo.evidencia).toEqual([{ id: 5, ruta: '2026/11/foto.jpg' }])
  })

  // El disco NO tiene rollback: si la transacción se deshace y nadie borra, los
  // archivos quedan huérfanos para siempre en un disco que ya está al 54 %.
  test('un fallo a mitad deshace la transacción y borra del disco lo escrito', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    const conn = connDoble({ fallaEn: 'UPDATE h360_lab_tarea' })
    db.getConnection.mockResolvedValue(conn)
    evid.guardarEvidencias.mockResolvedValue({
      filas: [{ id: 5 }], rutasEscritas: ['/datos/2026/11/foto.jpg'],
    })

    const { next } = await llamar(ctrl.registrar, reqFalso({
      body: { laboratorio_id: 1, tarea_id: 12 }, files: [foto()],
    }))

    expect(next).toHaveBeenCalled()
    expect(conn.commits).toBe(0)
    expect(conn.rollbacks).toBe(1)
    expect(evid.descartarEvidencias).toHaveBeenCalledWith(['/datos/2026/11/foto.jpg'])
    expect(conn.liberada).toBe(true)
  })

  // Lo mismo si lo que falla es el propio guardado de las fotos a mitad del
  // lote: el servicio devuelve las rutas en la excepción no, así que lo que se
  // cubre acá es que la transacción se deshaga igual y la conexión se libere.
  test('si el guardado de las fotos lanza, deshace y libera la conexión', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evid.guardarEvidencias.mockRejectedValue(new Error('sin espacio en disco'))

    const { next } = await llamar(ctrl.registrar, reqFalso({
      body: { laboratorio_id: 1, tarea_id: 12 }, files: [foto()],
    }))

    expect(next).toHaveBeenCalled()
    expect(conn.rollbacks).toBe(1)
    expect(conn.liberada).toBe(true)
  })

  // Sin fotos no hay nada que borrar, y llamar al descarte con la lista vacía
  // solo ensucia el log del fallo real.
  test('si no se escribió ninguna foto no se llama al descarte', async () => {
    prepararEscritura()
    const conn = connDoble({ fallaEn: 'INSERT INTO h360_lab_registro' })
    db.getConnection.mockResolvedValue(conn)

    const { next } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    expect(next).toHaveBeenCalled()
    expect(conn.rollbacks).toBe(1)
    expect(evid.descartarEvidencias).not.toHaveBeenCalled()
    expect(conn.liberada).toBe(true)
  })

  // El flujo de n8n que copia a Drive arma las carpetas con la PLACA y lee
  // h360_desinf_registro: llamarlo con el id de un registro de laboratorio
  // mandaría a Drive las fotos del vehículo que tenga ese id. El laboratorio no
  // copia a Drive todavía; está reportado como pendiente.
  test('no intenta la copia a Drive: ese flujo es el de vehículos', async () => {
    prepararEscritura({ tarea: TAREA_CON_FOTO })
    db.getConnection.mockResolvedValue(connDoble())
    evid.guardarEvidencias.mockResolvedValue({ filas: [{ id: 5 }], rutasEscritas: ['/a/1.jpg'] })

    await llamar(ctrl.registrar, reqFalso({
      body: { laboratorio_id: 1, tarea_id: 12 }, files: [foto()],
    }))

    expect(evid.enviarEvidenciasADrive).not.toHaveBeenCalled()
  })

  test('las fechas del registro que vuelve son texto AAAA-MM-DD', async () => {
    prepararEscritura()
    db.getConnection.mockResolvedValue(connDoble())

    const { res } = await llamar(ctrl.registrar,
      reqFalso({ body: { laboratorio_id: 1, tarea_id: 10 } }))

    expect(res.cuerpo.registro.fecha_ejecucion).toBe(HOY)
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)

    const sql = db.query.mock.calls.map(c => String(c[0])).find(s => /FROM h360_lab_registro g/i.test(s))
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_ejecucion/i)
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_esperada/i)
    expect(sql).not.toMatch(/created_at|updated_at/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Omitir
// ═══════════════════════════════════════════════════════════════════════════

describe('omitirTarea', () => {
  const prepararTarea = (tarea = TAREA_ABIERTA, afectadas = 1) =>
    db.query.mockImplementation(async (sql, params) => {
      const s = String(sql)
      if (/FROM h360_lab_tarea t/i.test(s)) { pasos.push({ paso: 'tarea', params }); return [tarea ? [tarea] : []] }
      if (/^UPDATE/i.test(s.trim()))        { pasos.push({ paso: 'update', sql: s, params }); return [{ affectedRows: afectadas }] }
      return [[]]
    })

  // El motivo obligatorio es lo que impide que la gente omita para que el
  // indicador no se ponga rojo. Sin él, «OMITIDA» no dice nada y el dato deja
  // de servir en una auditoría.
  test('sin motivo da 400 y no escribe', async () => {
    for (const motivo of [undefined, '', '   ', null]) {
      jest.clearAllMocks()
      prepararTarea()
      const { res } = await llamar(ctrl.omitirTarea,
        reqFalso({ params: { id: '10' }, body: { motivo_omision: motivo } }))

      expect([motivo, res.codigo]).toEqual([motivo, 400])
      expect(res.cuerpo).toMatchObject({ campo: 'motivo_omision' })
      expect(db.query.mock.calls.some(c => /^UPDATE/i.test(String(c[0]).trim()))).toBe(false)
    }
  })

  test('con motivo la pasa a OMITIDA y guarda quién y por qué', async () => {
    prepararTarea()
    const { res } = await llamar(ctrl.omitirTarea, reqFalso({
      params: { id: '10' }, body: { motivo_omision: '  No llegó el insumo  ' },
    }))

    expect(res.codigo).toBe(200)
    const upd = pasos.find(p => p.paso === 'update')
    expect(upd.sql).toMatch(/estado\s*=\s*'OMITIDA'/i)
    // El guardia: si alguien la cerró en el medio, no se pisa.
    expect(upd.sql).toMatch(/estado\s*=\s*'PENDIENTE'/i)
    expect(upd.params).toEqual(['No llegó el insumo', 'COORD1', 10])
  })

  test('una tarea ya cerrada da 409 y no escribe', async () => {
    for (const estado of ['HECHA', 'OMITIDA', 'NO_HECHA']) {
      jest.clearAllMocks()
      prepararTarea({ ...TAREA_ABIERTA, estado })
      const { res } = await llamar(ctrl.omitirTarea,
        reqFalso({ params: { id: '10' }, body: { motivo_omision: 'Vacaciones' } }))

      expect([estado, res.codigo]).toEqual([estado, 409])
      expect(db.query.mock.calls.some(c => /^UPDATE/i.test(String(c[0]).trim()))).toBe(false)
    }
  })

  test('una tarea que no existe da 404', async () => {
    prepararTarea(null)
    const { res } = await llamar(ctrl.omitirTarea,
      reqFalso({ params: { id: '99' }, body: { motivo_omision: 'Vacaciones' } }))
    expect(res.codigo).toBe(404)
  })

  // La carrera: la leímos PENDIENTE y alguien la cerró antes del UPDATE.
  test('si se cerró entre la lectura y el UPDATE da 409', async () => {
    prepararTarea(TAREA_ABIERTA, 0)
    const { res } = await llamar(ctrl.omitirTarea,
      reqFalso({ params: { id: '10' }, body: { motivo_omision: 'Vacaciones' } }))
    expect(res.codigo).toBe(409)
  })

  test('un id inválido da 400 sin tocar la base', async () => {
    const { res } = await llamar(ctrl.omitirTarea,
      reqFalso({ params: { id: '0' }, body: { motivo_omision: 'Vacaciones' } }))
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Historial y evidencia
// ═══════════════════════════════════════════════════════════════════════════

describe('listarRegistros', () => {
  test('filtra por laboratorio, fechas y actividad, y acota el resultado', async () => {
    db.query.mockResolvedValue([[REGISTRO_GUARDADO]])
    await llamar(ctrl.listarRegistros, reqFalso({ query: {
      laboratorio_id: '1', desde: '2026-11-01', hasta: '2026-11-25', actividad: 'trampa',
    } }))

    const [sql, params] = db.query.mock.calls[0]
    expect(String(sql)).toMatch(/g\.laboratorio_id = \?/)
    expect(String(sql)).toMatch(/g\.fecha_ejecucion >= \?/)
    expect(String(sql)).toMatch(/g\.fecha_ejecucion <= \?/)
    expect(String(sql)).toMatch(/g\.actividad_nombre LIKE \?/)
    expect(String(sql)).toMatch(/LIMIT/i)
    expect(params).toEqual([1, '2026-11-01', '2026-11-25', '%trampa%'])
  })

  test('una fecha que no existe da 400 y no consulta', async () => {
    const { res } = await llamar(ctrl.listarRegistros, reqFalso({ query: { desde: '2026-02-31' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo).toMatchObject({ campo: 'desde' })
    expect(db.query).not.toHaveBeenCalled()
  })

  test('las fechas salen formateadas en SQL y no trae TIMESTAMP', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarRegistros, reqFalso())

    const sql = String(db.query.mock.calls[0][0])
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_ejecucion\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).toMatch(/DATE_FORMAT\(\s*g\.fecha_esperada\s*,\s*'%Y-%m-%d'\s*\)/i)
    expect(sql).not.toMatch(/created_at|updated_at/)
  })

  test('cuenta las evidencias desde la tabla del laboratorio', async () => {
    db.query.mockResolvedValue([[]])
    await llamar(ctrl.listarRegistros, reqFalso())
    expect(String(db.query.mock.calls[0][0])).toMatch(/FROM h360_lab_evidencia/i)
  })
})

describe('servirEvidencia', () => {
  // El mismo handler del módulo de vehículos, armado sobre la tabla del
  // laboratorio: la normalización de la ruta y la lista blanca de mimes no se
  // duplican acá, que es justo donde se cometen los errores que se pagan caro.
  test('es el handler del servicio, montado sobre h360_lab_evidencia', () => {
    expect(typeof ctrl.servirEvidencia).toBe('function')
    expect(ctrl.servirEvidencia.tabla).toBe('h360_lab_evidencia')
  })
})
