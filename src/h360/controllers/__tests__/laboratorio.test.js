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

const db   = require('../../config/db')
const svc  = require('../../services/laboratorio.service')
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

  test('el atraso se mide contra el «hoy» de Bogotá', async () => {
    await llamar(ctrl.tablero, reqFalso())

    const consulta = pasos.find(p => p.paso === 'tareas')
    expect(consulta.params[0]).toBe(HOY)
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
