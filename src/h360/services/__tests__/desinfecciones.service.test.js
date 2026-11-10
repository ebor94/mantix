// El barrido nocturno de desinfecciones.
//
// Lo que se cuida acá, en orden de qué duele más si se rompe:
//
//  1. Que el job NO pise un vehículo que está abajo por otra razón. Si una
//     carroza está fuera de servicio por un choque y el barrido le reescribe el
//     motivo, el tablero empieza a decir que el problema es una limpieza
//     pendiente y alguien la vuelve a poner en ruta accidentada.
//  2. Que sea idempotente. Corre todas las noches: el que ya está abajo por
//     desinfección no se puede volver a bajar, porque eso movería inactivo_at y
//     se perdería desde cuándo está detenido.
//  3. Que las fechas se comparen y se formateen EN SQL. El pool no tiene
//     dateStrings; una fecha calculada en JavaScript puede estar corrida un día
//     y acá un día es inhabilitar un vehículo antes de lo debido.
//  4. Que un webhook caído o una base caída no tumben el proceso: el cron no
//     tiene a nadie detrás para atrapar la excepción.

jest.mock('../../config/db')
jest.mock('../googleChat.service', () => ({
  enviar: jest.fn(),
  enviarOperaciones: jest.fn(),
}))
jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }))

const db      = require('../../config/db')
const gchat   = require('../googleChat.service')
const cron    = require('node-cron')
const desinf  = require('../desinfecciones.service')

// El «hoy» de MySQL para la base falsa. Las fechas ISO se comparan como texto
// sin sorpresas, que es justo lo que hace CURDATE() contra un DATE.
const HOY = '2026-11-09'

/**
 * Base falsa con estado: no devuelve filas fijas, aplica los WHERE que importan
 * sobre un par de tablas en memoria. Así el test de «no pisa lo MANUAL» prueba
 * comportamiento y no una expresión regular sobre el SQL.
 */
function baseFalsa({ vehiculos = [], programaciones = [], fallaEn = null } = {}) {
  const estado = {
    vehiculos: vehiculos.map(v => ({ ...v })),
    programaciones: programaciones.map(p => ({ ...p })),
    consultas: [],
    commits: 0,
    rollbacks: 0,
    liberada: false,
  }

  const query = async (sql, params) => {
    estado.consultas.push({ sql, params })
    if (fallaEn && sql.includes(fallaEn)) throw new Error('fallo simulado de base')

    // 1) Vencer programaciones: PROGRAMADA con fecha anterior a hoy.
    if (/UPDATE h360_desinf_programacion/i.test(sql)) {
      let n = 0
      for (const p of estado.programaciones) {
        if (p.estado === 'PROGRAMADA' && p.fecha_prox && p.fecha_prox < HOY) {
          p.estado = 'VENCIDA'
          n++
        }
      }
      return [{ affectedRows: n }]
    }

    // 2) Candidatos: vencidas de vehículos ACTIVOS, la más vieja primero.
    if (/SELECT/i.test(sql) && /FROM h360_desinf_programacion p/i.test(sql)) {
      const filas = estado.programaciones
        .filter(p => p.estado === 'VENCIDA')
        .map(p => ({ p, v: estado.vehiculos.find(v => v.id === p.vehiculo_id) }))
        .filter(({ v }) => v && v.activo === 1)
        .map(({ p, v }) => ({
          vehiculo_id: v.id, placa: v.placa, tipo: v.tipo,
          actividad: p.actividad, fecha_prox: p.fecha_prox,
        }))
        .sort((a, b) => a.placa.localeCompare(b.placa) || a.fecha_prox.localeCompare(b.fecha_prox))
      return [filas]
    }

    // 3) Bajar el vehículo, solo si sigue activo.
    if (/UPDATE vehiculos/i.test(sql)) {
      const [motivo, por, id] = params
      const v = estado.vehiculos.find(x => x.id === id && x.activo === 1)
      if (!v) return [{ affectedRows: 0 }]
      Object.assign(v, {
        activo: 0, inactivo_origen: 'DESINFECCION',
        inactivo_motivo: motivo, inactivo_por: por, inactivo_at: '2026-11-09 00:05:00',
      })
      return [{ affectedRows: 1 }]
    }

    return [[]]
  }

  estado.conn = {
    query: jest.fn(query),
    beginTransaction: jest.fn(),
    commit: jest.fn(() => { estado.commits++ }),
    rollback: jest.fn(() => { estado.rollbacks++; return Promise.resolve() }),
    release: jest.fn(() => { estado.liberada = true }),
  }
  return estado
}

// Un parque chico pero con los cuatro casos que importan.
const VEHICULOS = () => [
  // Activo con una desinfección que se le pasó: este sí se baja.
  { id: 1, placa: 'ABC123', tipo: 'CARROZA',  activo: 1, inactivo_origen: null, inactivo_motivo: null },
  // Abajo por un choque: NO se toca ni se le cambia el motivo.
  { id: 2, placa: 'DEF456', tipo: 'TRASLADO', activo: 0, inactivo_origen: 'MANUAL',
    inactivo_motivo: 'Choque en la 80, en el taller', inactivo_at: '2026-11-01 09:00:00', inactivo_por: 'BORTEGA' },
  // Ya abajo por desinfección desde anoche: el job no lo vuelve a bajar.
  { id: 3, placa: 'GHI789', tipo: 'CARROZA',  activo: 0, inactivo_origen: 'DESINFECCION',
    inactivo_motivo: 'Vencimiento de desinfección: Limpieza y lavado, vencida desde el 01/11/2026',
    inactivo_at: '2026-11-08 00:05:00', inactivo_por: 'sistema' },
  // Al día: no aparece en ninguna lista.
  { id: 4, placa: 'JKL012', tipo: 'TRASLADO', activo: 1, inactivo_origen: null, inactivo_motivo: null },
]

const PROGRAMACIONES = () => [
  { vehiculo_id: 1, actividad: 'Desinfección choque', estado: 'PROGRAMADA', fecha_prox: '2026-11-08' },
  { vehiculo_id: 2, actividad: 'Limpieza y lavado',   estado: 'PROGRAMADA', fecha_prox: '2026-11-07' },
  { vehiculo_id: 3, actividad: 'Limpieza y lavado',   estado: 'VENCIDA',    fecha_prox: '2026-11-01' },
  { vehiculo_id: 4, actividad: 'Lavado y polichado',  estado: 'PROGRAMADA', fecha_prox: '2026-11-20' },
]

function montar(opciones) {
  const bd = baseFalsa(opciones)
  db.getConnection = jest.fn().mockResolvedValue(bd.conn)
  db.query = jest.fn(async () => [[]])
  return bd
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.DESINF_AVISO_DIAS
  gchat.enviarOperaciones.mockResolvedValue({ ok: true })
})

// ── barrerVencidas: qué vence ───────────────────────────────────────────────
describe('barrerVencidas pasa a VENCIDA lo que se le pasó la fecha', () => {
  test('solo las PROGRAMADA con fecha anterior a hoy', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })

    const r = await desinf.barrerVencidas()

    // Las del 08 y del 07 vencen; la del 20 no, y la que ya estaba VENCIDA no
    // se vuelve a contar.
    expect(r.vencidas).toBe(2)
    expect(bd.programaciones.find(p => p.vehiculo_id === 4).estado).toBe('PROGRAMADA')
    expect(bd.commits).toBe(1)
    expect(bd.liberada).toBe(true)
  })

  test('la comparación es con CURDATE() de MySQL, no con una fecha de JavaScript', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    await desinf.barrerVencidas()

    const upd = bd.consultas.find(q => /UPDATE h360_desinf_programacion/i.test(q.sql))
    expect(upd.sql).toMatch(/fecha_prox\s*<\s*CURDATE\(\)/)
    expect(upd.sql).toMatch(/estado\s*=\s*'PROGRAMADA'/)
    // «<» y no «<=»: lo que vence hoy todavía se puede ejecutar hoy.
    expect(upd.sql).not.toMatch(/fecha_prox\s*<=\s*CURDATE\(\)/)
    expect(upd.params).toBeUndefined()
  })

  test('las fechas de los candidatos se formatean en SQL', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    await desinf.barrerVencidas()

    const sel = bd.consultas.find(q => /SELECT/i.test(q.sql) && /FROM h360_desinf_programacion p/i.test(q.sql))
    expect(sel.sql).toMatch(/DATE_FORMAT\(p\.fecha_prox, '%Y-%m-%d'\)\s+AS fecha_prox/)
  })
})

// ── barrerVencidas: a quién baja ────────────────────────────────────────────
describe('barrerVencidas inhabilita los vehículos afectados', () => {
  test('baja el vehículo con origen DESINFECCION, actor sistema y motivo que nombra la actividad', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })

    const r = await desinf.barrerVencidas()

    const v = bd.vehiculos.find(x => x.id === 1)
    expect(v.activo).toBe(0)
    expect(v.inactivo_origen).toBe('DESINFECCION')
    expect(v.inactivo_por).toBe('sistema')
    expect(v.inactivo_motivo).toMatch(/Desinfección choque/)
    // La fecha en el motivo va en dd/mm/aaaa y es la del vencimiento, no la de
    // ayer: si acá apareciera el 07 estaría corrida por UTC.
    expect(v.inactivo_motivo).toMatch(/vencida desde el 08\/11\/2026/)
    expect(v.inactivo_motivo.length).toBeLessThanOrEqual(200)

    expect(r.vehiculos_inhabilitados).toEqual([
      expect.objectContaining({ placa: 'ABC123', actividad: 'Desinfección choque', fecha_prox: '2026-11-08' }),
    ])
  })

  test('el UPDATE escribe NOW() y se protege con activo = 1', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    await desinf.barrerVencidas()

    const upd = bd.consultas.find(q => /UPDATE vehiculos/i.test(q.sql))
    expect(upd.sql).toMatch(/inactivo_at\s*=\s*NOW\(\)/)
    expect(upd.sql).toMatch(/WHERE id = \? AND activo = 1/)
  })

  test('EL IMPORTANTE: no pisa un vehículo que está abajo por MANUAL', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })

    const r = await desinf.barrerVencidas()

    // DEF456 tiene una desinfección que venció en este mismo barrido, pero está
    // abajo por un choque. El motivo del choque es el que importa.
    const v = bd.vehiculos.find(x => x.id === 2)
    expect(v.inactivo_origen).toBe('MANUAL')
    expect(v.inactivo_motivo).toBe('Choque en la 80, en el taller')
    expect(v.inactivo_at).toBe('2026-11-01 09:00:00')
    expect(v.inactivo_por).toBe('BORTEGA')

    expect(r.vehiculos_inhabilitados.map(x => x.placa)).not.toContain('DEF456')
    // Y ni se intentó: no hay UPDATE con su id.
    expect(bd.consultas.filter(q => /UPDATE vehiculos/i.test(q.sql) && q.params[2] === 2)).toHaveLength(0)
  })

  test('es idempotente: no vuelve a bajar uno que ya está abajo por desinfección', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    const antes = { ...bd.vehiculos.find(x => x.id === 3) }

    const r1 = await desinf.barrerVencidas()
    const r2 = await desinf.barrerVencidas()   // la noche siguiente

    const v = bd.vehiculos.find(x => x.id === 3)
    expect(v.inactivo_at).toBe(antes.inactivo_at)      // no se movió la fecha de la baja
    expect(v.inactivo_motivo).toBe(antes.inactivo_motivo)
    expect(r1.vehiculos_inhabilitados.map(x => x.placa)).not.toContain('GHI789')

    // El segundo barrido no encuentra nada nuevo: ni vence ni baja a nadie.
    expect(r2.vencidas).toBe(0)
    expect(r2.vehiculos_inhabilitados).toEqual([])
  })

  test('con varias vencidas nombra la más vieja y baja el vehículo una sola vez', async () => {
    const bd = montar({
      vehiculos: [{ id: 1, placa: 'ABC123', tipo: 'CARROZA', activo: 1, inactivo_origen: null }],
      programaciones: [
        { vehiculo_id: 1, actividad: 'Desinfección choque', estado: 'PROGRAMADA', fecha_prox: '2026-11-08' },
        { vehiculo_id: 1, actividad: 'Limpieza y lavado',   estado: 'PROGRAMADA', fecha_prox: '2026-11-02' },
      ],
    })

    const r = await desinf.barrerVencidas()

    expect(r.vencidas).toBe(2)
    expect(r.vehiculos_inhabilitados).toHaveLength(1)
    expect(r.vehiculos_inhabilitados[0].actividad).toBe('Limpieza y lavado')
    expect(bd.consultas.filter(q => /UPDATE vehiculos/i.test(q.sql))).toHaveLength(1)
  })
})

// ── barrerVencidas: la transacción ──────────────────────────────────────────
describe('barrerVencidas usa una sola transacción', () => {
  test('si falla la baja del vehículo, revierte y libera', async () => {
    const bd = montar({
      vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES(), fallaEn: 'UPDATE vehiculos',
    })

    await expect(desinf.barrerVencidas()).rejects.toThrow('fallo simulado de base')

    expect(bd.rollbacks).toBe(1)
    expect(bd.commits).toBe(0)
    expect(bd.liberada).toBe(true)
  })

  test('si falla el vencimiento, no se baja ningún vehículo', async () => {
    const bd = montar({
      vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES(),
      fallaEn: 'UPDATE h360_desinf_programacion',
    })

    await expect(desinf.barrerVencidas()).rejects.toThrow()

    expect(bd.consultas.filter(q => /UPDATE vehiculos/i.test(q.sql))).toHaveLength(0)
    expect(bd.rollbacks).toBe(1)
    expect(bd.liberada).toBe(true)
  })

  test('todo va por la misma conexión: una sola transacción para el barrido', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    await desinf.barrerVencidas()

    expect(db.getConnection).toHaveBeenCalledTimes(1)
    expect(bd.conn.beginTransaction).toHaveBeenCalledTimes(1)
    expect(db.query).not.toHaveBeenCalled()   // nada fuera de la transacción
  })
})

// ── resumenDiario ───────────────────────────────────────────────────────────
describe('resumenDiario arma las cuatro listas sin modificar nada', () => {
  function respuestas() {
    db.query = jest.fn()
      .mockResolvedValueOnce([[{ placa: 'JKL012', tipo: 'TRASLADO', actividad: 'Lavado y polichado', fecha: '2026-11-09' }]])
      .mockResolvedValueOnce([[{ placa: 'ABC123', tipo: 'CARROZA',  actividad: 'Desinfección choque', fecha: '2026-11-08' }]])
      .mockResolvedValueOnce([[{ placa: 'MNO345', tipo: 'CARROZA',  actividad: 'Limpieza y lavado',   fecha: '2026-11-11' }]])
      .mockResolvedValueOnce([[{ placa: 'ABC123', tipo: 'CARROZA',  actividad: 'Desinfección choque', fecha: '2026-11-09' }]])
    return db.query
  }

  test('devuelve vencen_hoy, vencidas, proximas e inhabilitados', async () => {
    respuestas()
    const r = await desinf.resumenDiario()

    expect(r.vencen_hoy[0].placa).toBe('JKL012')
    expect(r.vencidas[0].placa).toBe('ABC123')
    expect(r.proximas[0].placa).toBe('MNO345')
    expect(r.inhabilitados[0].placa).toBe('ABC123')
    // Cada elemento trae placa, tipo, actividad y fecha.
    for (const lista of [r.vencen_hoy, r.vencidas, r.proximas, r.inhabilitados]) {
      expect(lista[0]).toEqual(expect.objectContaining({
        placa: expect.any(String), tipo: expect.any(String),
        actividad: expect.any(String), fecha: expect.any(String),
      }))
    }
  })

  test('no escribe: ni transacción ni UPDATE', async () => {
    respuestas()
    await desinf.resumenDiario()

    expect(db.getConnection).not.toHaveBeenCalled()
    for (const [sql] of db.query.mock.calls) expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/i)
  })

  test('compara y formatea las fechas en SQL, no en JavaScript', async () => {
    respuestas()
    await desinf.resumenDiario()

    const [hoySql]    = db.query.mock.calls[0]
    const [vencSql]   = db.query.mock.calls[1]
    const [proxSql]   = db.query.mock.calls[2]
    const [inhabSql]  = db.query.mock.calls[3]

    expect(hoySql).toMatch(/p\.fecha_prox = CURDATE\(\)/)
    expect(vencSql).toMatch(/p\.estado = 'VENCIDA'/)
    expect(proxSql).toMatch(/p\.fecha_prox > CURDATE\(\)/)
    expect(proxSql).toMatch(/DATE_ADD\(CURDATE\(\), INTERVAL \? DAY\)/)
    for (const sql of [hoySql, vencSql, proxSql]) {
      expect(sql).toMatch(/DATE_FORMAT\(p\.fecha_prox, '%Y-%m-%d'\)\s+AS fecha/)
    }
    expect(inhabSql).toMatch(/DATE_FORMAT\(v\.inactivo_at, '%Y-%m-%d'\)/)
    expect(inhabSql).toMatch(/v\.inactivo_origen = 'DESINFECCION'/)
  })

  test('la ventana de aviso sale de DESINF_AVISO_DIAS, con 3 por default', async () => {
    respuestas()
    await desinf.resumenDiario()
    expect(db.query.mock.calls[2][1]).toEqual([3])

    process.env.DESINF_AVISO_DIAS = '7'
    respuestas()
    await desinf.resumenDiario()
    expect(db.query.mock.calls[2][1]).toEqual([7])
  })

  test('un valor absurdo en DESINF_AVISO_DIAS cae al default', async () => {
    for (const malo of ['0', '-5', 'tres', '900', '']) {
      process.env.DESINF_AVISO_DIAS = malo
      respuestas()
      await desinf.resumenDiario()
      expect(db.query.mock.calls[2][1]).toEqual([3])
    }
  })
})

// ── avisar ──────────────────────────────────────────────────────────────────
describe('avisar manda un solo mensaje, y solo si hay algo que decir', () => {
  const RESUMEN = {
    vencen_hoy:    [{ placa: 'JKL012', tipo: 'TRASLADO', actividad: 'Lavado y polichado', fecha: '2026-11-09' }],
    vencidas:      [{ placa: 'ABC123', tipo: 'CARROZA',  actividad: 'Desinfección choque', fecha: '2026-11-08' }],
    proximas:      [{ placa: 'MNO345', tipo: 'CARROZA',  actividad: 'Limpieza y lavado',   fecha: '2026-11-11' }],
    inhabilitados: [{ placa: 'ABC123', tipo: 'CARROZA',  actividad: 'Desinfección choque', fecha: '2026-11-09' }],
    dias_aviso: 3,
  }

  test('un mensaje con secciones, no cinco mensajes', async () => {
    const r = await desinf.avisar(RESUMEN)

    expect(gchat.enviarOperaciones).toHaveBeenCalledTimes(1)
    expect(r.enviado).toBe(true)

    const [texto] = gchat.enviarOperaciones.mock.calls[0]
    expect(texto).toMatch(/Vehículos inhabilitados \(1\)/)
    expect(texto).toMatch(/Vencidas sin registrar \(1\)/)
    expect(texto).toMatch(/Vencen hoy \(1\)/)
    expect(texto).toMatch(/Próximas \(3 días\) \(1\)/)
  })

  test('las fechas del mensaje van en dd/mm/aaaa', async () => {
    await desinf.avisar(RESUMEN)
    const [texto] = gchat.enviarOperaciones.mock.calls[0]

    expect(texto).toMatch(/08\/11\/2026/)
    expect(texto).toMatch(/11\/11\/2026/)
    // Y no queda ningún ISO crudo a la vista.
    expect(texto).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  test('si no hay nada que avisar NO manda nada', async () => {
    const r = await desinf.avisar({ vencen_hoy: [], vencidas: [], proximas: [], inhabilitados: [] })

    expect(gchat.enviarOperaciones).not.toHaveBeenCalled()
    expect(r.enviado).toBe(false)
  })

  test('con una sola sección con contenido manda igual, sin las vacías', async () => {
    const r = await desinf.avisar({ vencen_hoy: [], vencidas: [], inhabilitados: [], proximas: RESUMEN.proximas })

    expect(r.enviado).toBe(true)
    const [texto] = gchat.enviarOperaciones.mock.calls[0]
    expect(texto).toMatch(/Próximas/)
    expect(texto).not.toMatch(/Vencidas sin registrar/)
    expect(texto).not.toMatch(/Vehículos inhabilitados/)
  })

  test('sin resumen lo consulta solo (se puede llamar a mano)', async () => {
    db.query = jest.fn().mockResolvedValue([[]])
    const r = await desinf.avisar()

    expect(db.query).toHaveBeenCalled()
    expect(r.enviado).toBe(false)
  })
})

// ── ejecutarBarridoDiario ───────────────────────────────────────────────────
describe('ejecutarBarridoDiario nunca lanza', () => {
  test('orquesta barrido, resumen y aviso en ese orden', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    db.query = jest.fn().mockResolvedValue([[{ placa: 'ABC123', tipo: 'CARROZA', actividad: 'Desinfección choque', fecha: '2026-11-08' }]])

    const r = await desinf.ejecutarBarridoDiario()

    expect(r.errores).toEqual([])
    expect(r.barrido.vencidas).toBe(2)
    expect(r.resumen).not.toBeNull()
    expect(r.aviso.enviado).toBe(true)
    expect(gchat.enviarOperaciones).toHaveBeenCalledTimes(1)
    expect(bd.commits).toBe(1)
  })

  test('no lanza cuando el webhook falla, y el barrido ya quedó hecho', async () => {
    const bd = montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES() })
    db.query = jest.fn().mockResolvedValue([[{ placa: 'ABC123', tipo: 'CARROZA', actividad: 'Desinfección choque', fecha: '2026-11-08' }]])
    gchat.enviarOperaciones.mockRejectedValue(new Error('webhook 503'))

    const r = await desinf.ejecutarBarridoDiario()

    expect(r.errores).toEqual([expect.objectContaining({ paso: 'avisar' })])
    expect(bd.vehiculos.find(v => v.id === 1).activo).toBe(0)   // el barrido no se deshizo
    expect(bd.commits).toBe(1)
  })

  test('no lanza cuando la base falla, y no intenta avisar a medias', async () => {
    db.getConnection = jest.fn().mockRejectedValue(new Error('ER_CON_COUNT_ERROR'))
    db.query = jest.fn().mockRejectedValue(new Error('ER_CON_COUNT_ERROR'))

    const r = await desinf.ejecutarBarridoDiario()

    expect(r.barrido).toBeNull()
    expect(r.resumen).toBeNull()
    expect(r.aviso).toBeNull()
    expect(r.errores.map(e => e.paso)).toEqual(['barrerVencidas', 'resumenDiario'])
    expect(gchat.enviarOperaciones).not.toHaveBeenCalled()
  })

  test('si el barrido falla pero la consulta sirve, igual avisa', async () => {
    montar({ vehiculos: VEHICULOS(), programaciones: PROGRAMACIONES(), fallaEn: 'UPDATE h360_desinf_programacion' })
    db.query = jest.fn().mockResolvedValue([[{ placa: 'ABC123', tipo: 'CARROZA', actividad: 'Desinfección choque', fecha: '2026-11-08' }]])

    const r = await desinf.ejecutarBarridoDiario()

    expect(r.errores.map(e => e.paso)).toEqual(['barrerVencidas'])
    expect(r.aviso.enviado).toBe(true)
  })
})

// ── El job ──────────────────────────────────────────────────────────────────
describe('el job de desinfecciones', () => {
  // El job guarda su `task` en una variable de módulo, así que cada prueba
  // necesita el módulo recién cargado. Con resetModules se vuelven a crear
  // también los mocks, y por eso node-cron y el servicio se re-piden acá: las
  // referencias de arriba quedan apuntando a la instancia anterior.
  let job, cronFresco, servicio
  beforeEach(() => {
    jest.resetModules()
    cronFresco = require('node-cron')
    job        = require('../../jobs/desinfecciones.job')
    servicio   = require('../desinfecciones.service')
  })

  test('arma un solo cron a las 00:05 de Bogotá', () => {
    job.start()

    expect(cronFresco.schedule).toHaveBeenCalledTimes(1)
    const [expresion, , opciones] = cronFresco.schedule.mock.calls[0]
    expect(expresion).toBe('5 0 * * *')
    expect(opciones).toEqual(expect.objectContaining({ scheduled: true, timezone: 'America/Bogota' }))
  })

  test('start() dos veces no duplica el cron', () => {
    job.start()
    job.start()
    expect(cronFresco.schedule).toHaveBeenCalledTimes(1)
  })

  test('el cron llama al barrido del servicio y se traga cualquier error', async () => {
    const spy = jest.spyOn(servicio, 'ejecutarBarridoDiario')
      .mockRejectedValue(new Error('imposible, pero por si acaso'))
    job.start()
    const [, callback] = cronFresco.schedule.mock.calls[0]

    await expect(callback()).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
