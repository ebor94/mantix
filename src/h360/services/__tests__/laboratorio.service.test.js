// Generación del día del laboratorio.
//
// Esto es lo que decide qué aparece en el tablero y qué queda escrito como
// incumplimiento en una auditoría sanitaria, así que lo que se cuida acá es,
// en orden de qué duele más si se rompe:
//
//  1. Idempotencia. `generarDia` se llama DOS veces por día como mínimo: el
//     cron de las 00:05 y la primera consulta del tablero. Si la segunda
//     duplica, el laboratorio amanece con la lista doble y el porcentaje de
//     cumplimiento del informe queda dividido por dos.
//  2. No abrir una tarea nueva mientras haya una abierta de la misma regla. Sin
//     ese guardia, una quincenal atrasada dos semanas produce 14 filas
//     NO_HECHA y el informe diría que el laboratorio falló 14 veces cuando
//     falló una.
//  3. Solo las DIARIA caducan. La desinfección quincenal que no se hizo se
//     SIGUE debiendo: si `cerrarDiariasVencidas` la cerrara, el atraso
//     desaparecería del tablero y el informe empezaría a mentir a favor
//     nuestro, que en una auditoría es el peor de los dos errores.
//  4. Las POR_EVENTO no entran al generador. Se filtran por frecuencia, nunca
//     con `arrastra()` —que devuelve true para ellas— porque no tienen día.
//  5. CADA_N_DIAS no la decide el calendario sino cuándo se resolvió la
//     anterior; `reglaAplicaEn` devuelve false a propósito y el generador
//     necesita su propio camino. Si se usara `reglaAplicaEn` como filtro
//     único, las dos quincenales no aparecerían NUNCA en el tablero.
//  6. El «hoy» es el de Bogotá y no el de UTC. A las 9 de la noche en Cúcuta
//     ya es el día siguiente en UTC: el cron de medianoche generaría el día
//     equivocado.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))

const db  = require('../../config/db')
const svc = require('../laboratorio.service')

const LAB  = 1
const LUN  = '2026-11-23'   // lunes
const MAR  = '2026-11-24'   // martes
const MIE  = '2026-11-25'   // miércoles
const VIE  = '2026-11-27'   // viernes
const SAB  = '2026-11-28'   // sábado

/** Días entre dos fechas en texto, en UTC, como el DATEDIFF de MySQL. */
function datediff(hasta, desde) {
  const [a1, a2, a3] = String(hasta).split('-').map(Number)
  const [b1, b2, b3] = String(desde).split('-').map(Number)
  return Math.round((Date.UTC(a1, a2 - 1, a3) - Date.UTC(b1, b2 - 1, b3)) / 86400000)
}

/**
 * Base falsa CON ESTADO: no devuelve filas fijas, guarda tareas y aplica la
 * clave única `uk_lab_tarea (laboratorio_id, regla_id, fecha)` igual que MySQL.
 *
 * Es a propósito y no por gusto: la idempotencia es la invariante número uno
 * del módulo, y contra un `query` que siempre devuelve `affectedRows: 1` no se
 * puede probar. Con estado, «la segunda llamada no duplica» es una afirmación
 * sobre el comportamiento y no sobre una expresión regular aplicada al SQL.
 *
 * Las consultas se enrutan por el alias de columna que cada una expone
 * (`dias_desde_ejecucion`, `fecha_abierta`, `laboratorio_id`) y no por el
 * nombre de la tabla: la consulta de reglas trae subconsultas contra
 * h360_lab_tarea y h360_lab_registro, así que enrutar por tabla la confundiría
 * con la de tareas abiertas.
 */
function baseFalsa({
  labs = [{ id: LAB, activo: 1 }],
  reglas = [], tareas = [], registros = [], fallaEn = null,
} = {}) {
  const estado = {
    labs,
    reglas: reglas.map(r => ({
      laboratorio_id: LAB, activo: 1, cada_dias: null, dia_semana: null, ...r,
    })),
    tareas: tareas.map(t => ({ laboratorio_id: LAB, estado: 'PENDIENTE', ...t })),
    registros: registros.map(g => ({ laboratorio_id: LAB, ...g })),
    sql: [],
  }

  const buscarRegla = id => estado.reglas.find(r => r.id === id)
  const maximo = lista => (lista.length ? lista.slice().sort().at(-1) : null)

  db.query.mockImplementation(async (sql, params = []) => {
    const plano = String(sql).replace(/\s+/g, ' ').trim()
    estado.sql.push(plano)
    if (fallaEn && new RegExp(fallaEn, 'i').test(plano)) throw new Error('base caída')

    // ── INSERT IGNORE de las tareas del día ───────────────────────────────
    if (/^INSERT IGNORE INTO h360_lab_tarea/i.test(plano)) {
      const filas = params[0] || []
      let creadas = 0
      for (const [lab, reglaId, fecha] of filas) {
        const duplicada = estado.tareas.some(
          t => t.laboratorio_id === lab && t.regla_id === reglaId && t.fecha === fecha)
        if (duplicada) continue          // uk_lab_tarea: IGNORE la descarta
        estado.tareas.push({ laboratorio_id: lab, regla_id: reglaId, fecha, estado: 'PENDIENTE' })
        creadas++
      }
      return [{ affectedRows: creadas }]
    }

    // ── UPDATE de caducidad de las diarias ────────────────────────────────
    if (/^UPDATE h360_lab_tarea/i.test(plano)) {
      const [actor, fecha] = params
      let cerradas = 0
      for (const t of estado.tareas) {
        if (t.estado !== 'PENDIENTE') continue
        if (!(t.fecha < fecha)) continue
        if (buscarRegla(t.regla_id)?.frecuencia !== 'DIARIA') continue
        t.estado = 'NO_HECHA'
        t.cerrada_por = actor
        cerradas++
      }
      return [{ affectedRows: cerradas }]
    }

    // ── Reglas candidatas del laboratorio ─────────────────────────────────
    if (/AS dias_desde_ejecucion/.test(plano)) {
      const fecha = params[0]
      const lab   = params[2]
      const filas = estado.reglas
        .filter(r => r.laboratorio_id === lab && r.activo === 1 &&
                     ['DIARIA', 'SEMANAL', 'CADA_N_DIAS'].includes(r.frecuencia))
        .map(r => {
          const ejec = maximo(estado.registros
            .filter(g => g.regla_id === r.id && g.laboratorio_id === lab)
            .map(g => g.fecha_ejecucion))
          const cierre = maximo(estado.tareas
            .filter(t => t.regla_id === r.id && t.laboratorio_id === lab && t.estado !== 'PENDIENTE')
            .map(t => t.fecha))
          return {
            regla_id: r.id, frecuencia: r.frecuencia,
            dia_semana: r.dia_semana, cada_dias: r.cada_dias,
            dias_desde_ejecucion: ejec   ? datediff(fecha, ejec)   : null,
            dias_desde_cierre:    cierre ? datediff(fecha, cierre) : null,
          }
        })
      return [filas]
    }

    // ── Tareas abiertas del laboratorio ──────────────────────────────────
    if (/AS fecha_abierta/.test(plano)) {
      const lab = params[0]
      const filas = estado.tareas
        .filter(t => t.laboratorio_id === lab && t.estado === 'PENDIENTE')
        .map(t => ({
          regla_id: t.regla_id,
          frecuencia: buscarRegla(t.regla_id)?.frecuencia,
          fecha_abierta: t.fecha,
        }))
      return [filas]
    }

    // ── Laboratorios activos ─────────────────────────────────────────────
    if (/FROM h360_lab l/.test(plano)) {
      return [estado.labs.filter(l => l.activo === 1).map(l => ({ laboratorio_id: l.id }))]
    }

    throw new Error(`consulta no prevista por la base falsa: ${plano}`)
  })

  return estado
}

/** Las tareas abiertas de una regla, para afirmar sin repetir el filtro. */
function tareasDe(estado, reglaId, fecha) {
  return estado.tareas.filter(t => t.regla_id === reglaId && (fecha ? t.fecha === fecha : true))
}

const inserts = () => db.query.mock.calls.filter(c => /^INSERT IGNORE/i.test(String(c[0]).trim()))

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => { jest.restoreAllMocks() })

// ── Invariante 1: idempotencia ──────────────────────────────────────────────
describe('generarDia es idempotente', () => {
  test('la segunda llamada con la misma fecha devuelve creadas: 0', async () => {
    const bd = baseFalsa({ reglas: [
      { id: 10, frecuencia: 'DIARIA' },
      { id: 11, frecuencia: 'DIARIA' },
    ] })

    const primera = await svc.generarDia(LAB, MIE)
    expect(primera).toEqual({ creadas: 2, ya_existian: 0, arrastradas: 0 })

    const segunda = await svc.generarDia(LAB, MIE)
    expect(segunda).toEqual({ creadas: 0, ya_existian: 2, arrastradas: 0 })

    // Y en la base quedó UNA fila por regla, no dos.
    expect(bd.tareas).toHaveLength(2)
    expect(tareasDe(bd, 10, MIE)).toHaveLength(1)
  })

  test('tres pasadas seguidas no mueven el total (el cron y el tablero el mismo día)', async () => {
    const bd = baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA' }] })

    await svc.generarDia(LAB, MIE)
    await svc.generarDia(LAB, MIE)
    await svc.generarDia(LAB, MIE)

    expect(bd.tareas).toHaveLength(1)
  })

  test('no manda el INSERT cuando no hay nada que crear', async () => {
    baseFalsa({ reglas: [{ id: 20, frecuencia: 'SEMANAL', dia_semana: 6 }] })

    const r = await svc.generarDia(LAB, VIE)   // viernes: la semanal es del sábado

    expect(r).toEqual({ creadas: 0, ya_existian: 0, arrastradas: 0 })
    expect(inserts()).toHaveLength(0)
  })
})

// ── Invariante 2: una tarea abierta bloquea la siguiente, pero SOLO si arrastra
describe('generarDia no abre otra tarea mientras haya una abierta', () => {
  // El guardia existe para lo que arrastra. Aplicado a las DIARIA anula la red
  // de seguridad del segundo disparador: `generarDia` se llama desde el tablero
  // justamente para cubrir que el cron de las 00:05 no haya corrido (servidor
  // caído), y si la diaria de ayer todavía PENDIENTE bloquea la de hoy, el
  // tablero muestra la lista de ayer y el incumplimiento del día no se escribe
  // NUNCA. Cada día es un evento de cumplimiento propio: la diaria del 26 no
  // depende de cómo quedó la del 25.
  test('las DIARIA de hoy nacen aunque las de ayer sigan PENDIENTE (sin cierre en el medio)', async () => {
    const DIARIAS = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, frecuencia: 'DIARIA' }))
    const bd = baseFalsa({ reglas: DIARIAS })

    const ayer = await svc.generarDia(LAB, MAR)
    expect(ayer.creadas).toBe(14)

    // Nadie cerró las de ayer: el cron no corrió y el tablero es el primero en
    // llegar. Las 14 del martes siguen PENDIENTE.
    const hoy = await svc.generarDia(LAB, MIE)

    expect(hoy.creadas).toBe(14)
    expect(hoy.ya_existian).toBe(0)
    // Una DIARIA vieja que sigue abierta es un cierre que no alcanzó a correr,
    // no un arrastre: no se cuenta.
    expect(hoy.arrastradas).toBe(0)
    expect(bd.tareas.filter(t => t.fecha === MIE)).toHaveLength(14)
    expect(bd.tareas.filter(t => t.fecha === MAR && t.estado === 'PENDIENTE')).toHaveLength(14)
  })

  test('la quincenal con tarea abierta sigue sin duplicarse', async () => {
    // El guardia hace falta justo acá: sin él una quincenal atrasada produce un
    // incumplimiento por día en vez de uno.
    const bd = baseFalsa({
      reglas: [
        { id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 },
        { id: 20, frecuencia: 'SEMANAL', dia_semana: 6 },
      ],
      tareas: [
        { regla_id: 30, fecha: '2026-11-10', estado: 'PENDIENTE' },
        { regla_id: 20, fecha: '2026-11-21', estado: 'PENDIENTE' },
      ],
    })

    const r = await svc.generarDia(LAB, SAB)   // sábado: a la semanal le tocaría

    expect(r.creadas).toBe(0)
    expect(r.arrastradas).toBe(2)
    expect(tareasDe(bd, 30)).toHaveLength(1)
    expect(tareasDe(bd, 20)).toHaveLength(1)
    expect(inserts()).toHaveLength(0)
  })

  test('una regla con tarea PENDIENTE de otro día no genera otra', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      tareas: [{ regla_id: 30, fecha: LUN, estado: 'PENDIENTE' }],
    })

    const r = await svc.generarDia(LAB, MIE)

    expect(r.creadas).toBe(0)
    expect(r.arrastradas).toBe(1)
    expect(bd.tareas).toHaveLength(1)
    expect(inserts()).toHaveLength(0)
  })

  test('la quincenal atrasada dos semanas deja UNA tarea, no catorce', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
    })

    // Catorce pasadas del cron, una por día, sin que nadie la ejecute.
    const dias = Array.from({ length: 14 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`)
    for (const dia of dias) await svc.generarDia(LAB, dia)

    expect(bd.tareas).toHaveLength(1)
    expect(bd.tareas[0].fecha).toBe('2026-11-10')
  })

  test('una tarea ya cerrada no bloquea: la diaria de hoy se abre igual', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 10, frecuencia: 'DIARIA' }],
      tareas: [{ regla_id: 10, fecha: MAR, estado: 'NO_HECHA' }],
    })

    const r = await svc.generarDia(LAB, MIE)

    expect(r.creadas).toBe(1)
    expect(tareasDe(bd, 10, MIE)).toHaveLength(1)
  })
})

// ── El calendario: DIARIA y SEMANAL ─────────────────────────────────────────
describe('generarDia respeta el calendario de la regla', () => {
  test('la SEMANAL del sábado se abre el sábado y no el viernes', async () => {
    const bd = baseFalsa({ reglas: [{ id: 20, frecuencia: 'SEMANAL', dia_semana: 6 }] })

    expect((await svc.generarDia(LAB, VIE)).creadas).toBe(0)
    expect((await svc.generarDia(LAB, SAB)).creadas).toBe(1)
    expect(tareasDe(bd, 20, SAB)).toHaveLength(1)
  })

  test('una regla inactiva no genera nada', async () => {
    baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA', activo: 0 }] })

    expect((await svc.generarDia(LAB, MIE)).creadas).toBe(0)
  })

  test('las reglas de otro laboratorio no se cruzan', async () => {
    const bd = baseFalsa({
      labs: [{ id: 1, activo: 1 }, { id: 2, activo: 1 }],
      reglas: [
        { id: 10, laboratorio_id: 1, frecuencia: 'DIARIA' },
        { id: 11, laboratorio_id: 2, frecuencia: 'DIARIA' },
      ],
    })

    const r = await svc.generarDia(2, MIE)

    expect(r.creadas).toBe(1)
    expect(bd.tareas).toEqual([
      expect.objectContaining({ laboratorio_id: 2, regla_id: 11, fecha: MIE }),
    ])
  })
})

// ── Invariante 5: el camino propio de CADA_N_DIAS ───────────────────────────
describe('generarDia decide CADA_N_DIAS por la última vez que se resolvió', () => {
  test('sin ejecuciones previas sí genera (si no, no aparecería nunca)', async () => {
    const bd = baseFalsa({ reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }] })

    const r = await svc.generarDia(LAB, MIE)

    expect(r.creadas).toBe(1)
    expect(tareasDe(bd, 30, MIE)).toHaveLength(1)
  })

  test('ejecutada hace menos de cada_dias no genera', async () => {
    baseFalsa({
      reglas:    [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      registros: [{ regla_id: 30, fecha_ejecucion: '2026-11-20' }],   // hace 5 días
    })

    expect((await svc.generarDia(LAB, MIE)).creadas).toBe(0)
    expect(inserts()).toHaveLength(0)
  })

  test('ejecutada hace exactamente cada_dias sí genera', async () => {
    baseFalsa({
      reglas:    [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      registros: [{ regla_id: 30, fecha_ejecucion: '2026-11-10' }],   // hace 15 días
    })

    expect((await svc.generarDia(LAB, MIE)).creadas).toBe(1)
  })

  test('una tarea OMITIDA ayer tampoco la vuelve exigible hoy', async () => {
    // Si el único ancla fuera la ejecución, una quincenal omitida (que no deja
    // registro) volvería a generar tarea TODOS los días: el mismo desastre de
    // los 14 incumplimientos, por la puerta de atrás.
    baseFalsa({
      reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      tareas: [{ regla_id: 30, fecha: MAR, estado: 'OMITIDA' }],
    })

    expect((await svc.generarDia(LAB, MIE)).creadas).toBe(0)
  })

  test('cerrada hace más de cada_dias vuelve a exigirse', async () => {
    baseFalsa({
      reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      tareas: [{ regla_id: 30, fecha: '2026-11-01', estado: 'OMITIDA' }],
    })

    expect((await svc.generarDia(LAB, MIE)).creadas).toBe(1)
  })
})

// ── Invariante 4: POR_EVENTO nunca produce tarea ────────────────────────────
describe('generarDia ignora las POR_EVENTO', () => {
  test('una POR_EVENTO no genera tarea ningún día de la semana', async () => {
    const bd = baseFalsa({ reglas: [{ id: 40, frecuencia: 'POR_EVENTO' }] })

    for (const dia of [LUN, MAR, MIE, VIE, SAB]) {
      expect((await svc.generarDia(LAB, dia)).creadas).toBe(0)
    }
    expect(bd.tareas).toHaveLength(0)
    expect(inserts()).toHaveLength(0)
  })

  test('se descartan por frecuencia en el SQL, no después', async () => {
    // El filtro va en el WHERE y no en JavaScript: lo que no tiene día no se
    // trae. `arrastra()` no sirve para decidirlo —devuelve true para
    // POR_EVENTO— y por eso no se la consulta en este camino.
    const bd = baseFalsa({ reglas: [{ id: 40, frecuencia: 'POR_EVENTO' }] })

    await svc.generarDia(LAB, MIE)

    const consulta = bd.sql.find(s => /dias_desde_ejecucion/.test(s))
    expect(consulta).toMatch(/frecuencia IN \('DIARIA', ?'SEMANAL', ?'CADA_N_DIAS'\)/)
  })
})

// ── Fechas y argumentos ─────────────────────────────────────────────────────
describe('generarDia valida lo que recibe', () => {
  test('una fecha que no existe no genera nada: lanza', async () => {
    baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA' }] })

    await expect(svc.generarDia(LAB, '2026-02-31')).rejects.toThrow(/fecha/i)
    await expect(svc.generarDia(LAB, 'mañana')).rejects.toThrow(/fecha/i)
    await expect(svc.generarDia(LAB, '2026-11-25T05:00:00.000Z')).rejects.toThrow(/fecha/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('un laboratorio inválido lanza antes de consultar', async () => {
    baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA' }] })

    await expect(svc.generarDia(0, MIE)).rejects.toThrow(/laboratorio/i)
    await expect(svc.generarDia(undefined, MIE)).rejects.toThrow(/laboratorio/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('la fecha se escribe tal cual, sin pasar por un Date', async () => {
    baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA' }] })

    await svc.generarDia(LAB, MIE)

    const [, params] = inserts()[0]
    expect(params[0]).toEqual([[LAB, 10, MIE]])
  })
})

// ── Invariante 3: solo las DIARIA caducan ───────────────────────────────────
describe('cerrarDiariasVencidas caduca solo las diarias', () => {
  test('la DIARIA pendiente de ayer queda NO_HECHA', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 10, frecuencia: 'DIARIA' }],
      tareas: [{ regla_id: 10, fecha: MAR, estado: 'PENDIENTE' }],
    })

    const r = await svc.cerrarDiariasVencidas(MIE)

    expect(r).toEqual({ cerradas: 1 })
    expect(bd.tareas[0].estado).toBe('NO_HECHA')
    expect(bd.tareas[0].cerrada_por).toBe('sistema')
  })

  test('NO toca una SEMANAL pendiente: la deuda sigue y acumula atraso', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 20, frecuencia: 'SEMANAL', dia_semana: 6 }],
      tareas: [{ regla_id: 20, fecha: '2026-11-21', estado: 'PENDIENTE' }],
    })

    const r = await svc.cerrarDiariasVencidas(MIE)

    expect(r.cerradas).toBe(0)
    expect(bd.tareas[0].estado).toBe('PENDIENTE')
  })

  test('NO toca una CADA_N_DIAS pendiente', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 30, frecuencia: 'CADA_N_DIAS', cada_dias: 15 }],
      tareas: [{ regla_id: 30, fecha: '2026-11-10', estado: 'PENDIENTE' }],
    })

    expect((await svc.cerrarDiariasVencidas(MIE)).cerradas).toBe(0)
    expect(bd.tareas[0].estado).toBe('PENDIENTE')
  })

  test('la diaria de HOY no se cierra: todavía se puede hacer hoy', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 10, frecuencia: 'DIARIA' }],
      tareas: [{ regla_id: 10, fecha: MIE, estado: 'PENDIENTE' }],
    })

    expect((await svc.cerrarDiariasVencidas(MIE)).cerradas).toBe(0)
    expect(bd.tareas[0].estado).toBe('PENDIENTE')
  })

  test('tampoco pisa una tarea ya cerrada (no mueve cerrada_at)', async () => {
    const bd = baseFalsa({
      reglas: [{ id: 10, frecuencia: 'DIARIA' }],
      tareas: [{ regla_id: 10, fecha: MAR, estado: 'HECHA' }],
    })

    expect((await svc.cerrarDiariasVencidas(MIE)).cerradas).toBe(0)
    expect(bd.tareas[0].estado).toBe('HECHA')
  })

  test('una fecha inválida lanza y no manda el UPDATE', async () => {
    baseFalsa()

    await expect(svc.cerrarDiariasVencidas('2026-13-01')).rejects.toThrow(/fecha/i)
    expect(db.query).not.toHaveBeenCalled()
  })
})

// ── La orquestación del cron ────────────────────────────────────────────────
describe('ejecutarGeneracionDiaria orquesta las dos sobre los labs activos', () => {
  test('cierra primero y genera después, en todos los laboratorios activos', async () => {
    const bd = baseFalsa({
      labs: [{ id: 1, activo: 1 }, { id: 2, activo: 1 }, { id: 3, activo: 0 }],
      reglas: [
        { id: 10, laboratorio_id: 1, frecuencia: 'DIARIA' },
        { id: 11, laboratorio_id: 2, frecuencia: 'DIARIA' },
        { id: 12, laboratorio_id: 3, frecuencia: 'DIARIA' },
      ],
      tareas: [{ laboratorio_id: 1, regla_id: 10, fecha: MAR, estado: 'PENDIENTE' }],
    })

    const r = await svc.ejecutarGeneracionDiaria()

    // El orden no es estético: si la diaria de ayer sigue PENDIENTE cuando
    // corre el generador, el guardia de «tarea abierta» le bloquea la de hoy y
    // el laboratorio amanece sin lista.
    const iCierre = bd.sql.findIndex(s => /^UPDATE h360_lab_tarea/i.test(s))
    const iAlta   = bd.sql.findIndex(s => /^INSERT IGNORE/i.test(s))
    expect(iCierre).toBeGreaterThanOrEqual(0)
    expect(iAlta).toBeGreaterThan(iCierre)

    expect(r.cerradas).toBe(1)
    expect(r.laboratorios).toEqual([
      { laboratorio_id: 1, creadas: 1, ya_existian: 0, arrastradas: 0 },
      { laboratorio_id: 2, creadas: 1, ya_existian: 0, arrastradas: 0 },
    ])
    expect(r.errores).toEqual([])
    // El laboratorio inactivo no se tocó.
    expect(bd.tareas.some(t => t.laboratorio_id === 3)).toBe(false)
  })

  test('usa el día de Bogotá y no el de UTC', async () => {
    baseFalsa({ reglas: [{ id: 10, frecuencia: 'DIARIA' }] })

    // 2026-11-26 02:30 UTC es el 25 a las 21:30 en Cúcuta. El cron corre a las
    // 00:05 de Bogotá, que en UTC es ya el día siguiente: con el reloj de UTC
    // el barrido generaría el día de mañana y el tablero amanecería vacío.
    expect(svc._internos.hoyBogota(new Date('2026-11-26T02:30:00Z'))).toBe(MIE)
    expect(svc._internos.hoyBogota(new Date('2026-11-25T05:10:00Z'))).toBe(MIE)

    const r = await svc.ejecutarGeneracionDiaria()
    expect(r.fecha).toBe(svc._internos.hoyBogota())
  })

  test('un laboratorio que falla no se lleva a los demás', async () => {
    const bd = baseFalsa({
      labs: [{ id: 1, activo: 1 }, { id: 2, activo: 1 }],
      reglas: [{ id: 11, laboratorio_id: 2, frecuencia: 'DIARIA' }],
    })
    // El primer laboratorio revienta al pedir sus reglas.
    const original = db.query.getMockImplementation()
    let visto = 0
    db.query.mockImplementation(async (sql, params) => {
      if (/AS dias_desde_ejecucion/.test(String(sql)) && ++visto === 1) throw new Error('base caída')
      return original(sql, params)
    })

    const r = await svc.ejecutarGeneracionDiaria()

    expect(r.errores).toEqual([
      expect.objectContaining({ paso: 'generarDia', laboratorio_id: 1, mensaje: 'base caída' }),
    ])
    expect(r.laboratorios).toEqual([
      { laboratorio_id: 2, creadas: 1, ya_existian: 0, arrastradas: 0 },
    ])
    expect(bd.tareas.some(t => t.laboratorio_id === 2)).toBe(true)
  })

  test('si el cierre de las diarias falla, igual genera y deja el error anotado', async () => {
    baseFalsa({
      reglas: [{ id: 10, frecuencia: 'DIARIA' }],
      fallaEn: '^UPDATE h360_lab_tarea',
    })

    const r = await svc.ejecutarGeneracionDiaria()

    expect(r.errores).toEqual([
      expect.objectContaining({ paso: 'cerrarDiariasVencidas', mensaje: 'base caída' }),
    ])
    expect(r.laboratorios).toHaveLength(1)
    expect(r.laboratorios[0].creadas).toBe(1)
  })

  test('nunca lanza: el cron no tiene a nadie detrás para atrapar la excepción', async () => {
    baseFalsa({ fallaEn: 'FROM h360_lab l' })

    const r = await svc.ejecutarGeneracionDiaria()

    expect(r.laboratorios).toEqual([])
    expect(r.errores).toEqual([
      expect.objectContaining({ paso: 'laboratoriosActivos', mensaje: 'base caída' }),
    ])
  })
})
