// Desinfecciones del parque automotor.
//
// Lo que se cuida acá, en orden de qué pasa si se rompe:
//
//  1. Que registrar una desinfección NO levante un vehículo que está abajo por
//     otra razón. Si eso se rompe, el módulo pone en servicio un carro
//     accidentado y nadie se entera hasta que sale a un homenaje.
//  2. Que el registro guarde COPIA de la periodicidad y del tipo de registro
//     que regían, y no un apuntador a la regla: cambiar la periodicidad mañana
//     no puede reescribir lo que se cumplió hace tres meses.
//  3. Que las fechas DATE salgan formateadas en SQL. El pool no tiene
//     `dateStrings` y una fecha devuelta como objeto se serializa en UTC: en
//     Colombia la pantalla muestra el día anterior.
//  4. Que lo que se puede rechazar se rechace antes de abrir la transacción, y
//     que lo que se escribió a medias se deshaga (base y disco).
//  5. Que la ventana del aviso la decida el servidor en la zona de Bogotá.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))
jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  guardarEvidencias: jest.fn(),
  descartarEvidencias: jest.fn(),
  enviarEvidenciasADrive: jest.fn(),
}))

const db = require('../../config/db')
const evidencia = require('../../services/desinfeccionEvidencia.service')
const ctrl = require('../desinfecciones.controller')

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

function reqFalso({ body = {}, params = {}, query = {}, files, user = COORD } = {}) {
  return { body, params, query, files, user }
}

async function llamar(fn, req) {
  const res = resFalso()
  const next = jest.fn()
  await fn(req, res, next)
  return { res, next }
}

/**
 * Conexión de transacción simulada. Guarda las consultas para poder afirmar qué
 * se escribió y permite hacer fallar una a propósito.
 */
function connDoble({ fallaEn = null, vencidas = 0, reactiva = 1 } = {}) {
  const c = {
    consultas: [],
    commits: 0,
    rollbacks: 0,
    liberada: false,
    beginTransaction: jest.fn(),
    commit: jest.fn(async () => { c.commits++ }),
    rollback: jest.fn(async () => { c.rollbacks++ }),
    release: jest.fn(() => { c.liberada = true }),
  }
  c.query = jest.fn(async (sql, params) => {
    c.consultas.push({ sql, params })
    if (fallaEn && sql.includes(fallaEn)) throw new Error('fallo simulado de base')
    if (/AS vencidas/i.test(sql)) return [[{ vencidas }]]
    if (/^INSERT/i.test(sql.trim())) return [{ insertId: 900, affectedRows: 1 }]
    if (/UPDATE vehiculos/i.test(sql)) return [{ affectedRows: reactiva }]
    if (/^SELECT/i.test(sql.trim())) return [[]]
    return [{ affectedRows: 1 }]
  })
  c.consultaCon = patron => c.consultas.find(q => new RegExp(patron, 'i').test(q.sql))
  return c
}

// La programación tal como la devuelve el controlador: con las fechas ya
// formateadas por DATE_FORMAT, que es como llegan de verdad.
const PROG_EVIDENCIA = {
  id: 10, vehiculo_id: 4, regla_id: 7, estado: 'PROGRAMADA',
  observaciones: null, ultimo_registro_id: null, programada_por: 'COORD1',
  fecha_prox: '2026-11-05', fecha_ult: '2026-10-21',
  placa: 'WGY123', tipo: 'TRASLADO', activo: 1, inactivo_origen: null, inactivo_motivo: null,
  actividad_id: 3, actividad: 'Desinfección choque',
  periodicidad_dias: 15, tipo_registro: 'EVIDENCIA',
}

const PROG_ORDEN = {
  ...PROG_EVIDENCIA, id: 11, regla_id: 5,
  actividad_id: 2, actividad: 'Limpieza y lavado', tipo_registro: 'ORDEN_SERVICIO',
}

const REGISTRO_GUARDADO = {
  id: 900, vehiculo_id: 4, regla_id: 7, actividad_nombre: 'Desinfección choque',
  tipo_registro: 'EVIDENCIA', periodicidad_dias: 15, fecha_ejecucion: '2026-11-09',
  fecha_programada: '2026-11-05', dias_atraso: 4, evidencias: 2,
}

function prepararPool({ programacion = PROG_EVIDENCIA, registro = REGISTRO_GUARDADO } = {}) {
  db.query.mockImplementation(async sql => {
    if (/FROM h360_desinf_programacion p/i.test(sql)) return [programacion ? [programacion] : []]
    if (/FROM h360_desinf_registro reg/i.test(sql))   return [registro ? [registro] : []]
    return [[]]
  })
}

const FOTO = { originalname: 'choque.jpg', mimetype: 'image/jpeg', size: 120000 }

// El instante se fija para que «hoy» no dependa del día en que se corran las
// pruebas. 2026-11-09 20:00 UTC son las 15:00 de Bogotá: fuera de la ventana.
const fijarInstante = instante => jest.useFakeTimers({
  now: instante,
  doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate',
    'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
})
const HOY_BOGOTA = '2026-11-09'
const INSTANTE_TARDE = new Date('2026-11-09T20:00:00Z')   // 15:00 en Bogotá

beforeEach(() => {
  jest.clearAllMocks()
  fijarInstante(INSTANTE_TARDE)
  prepararPool()
  evidencia.guardarEvidencias.mockResolvedValue({
    filas: [{ id: 1, ruta: 'desinf/2026/uno.jpg', bytes: 120000, mime: 'image/jpeg' }],
    rutasEscritas: ['/datos/uploads/desinf/2026/uno.jpg'],
  })
  evidencia.descartarEvidencias.mockResolvedValue(undefined)
  evidencia.enviarEvidenciasADrive.mockReturnValue(undefined)
})

afterEach(() => { jest.useRealTimers() })

// ═══════════════════════════════════════════════════════════════════════════
describe('las funciones que montan las rutas existen', () => {
  test.each([
    'listarActividades', 'crearActividad', 'actualizarActividad',
    'listarReglas', 'crearRegla', 'actualizarRegla',
    'sembrarVehiculo', 'tablero', 'actualizarProgramacion',
    'registrar', 'listarRegistros', 'pendientes',
  ])('exporta %s', nombre => expect(typeof ctrl[nombre]).toBe('function'))
})

// ═══════════════════════════════════════════════════════════════════════════
describe('registrar: lo que se rechaza antes de escribir', () => {
  // Rechazar es barato; rechazar después de haber escrito, no. Y una foto ya
  // guardada en disco por un registro que no existe es basura que nadie limpia.
  test('ORDEN_SERVICIO sin el número del talonario: 400 y no se abre transacción', async () => {
    prepararPool({ programacion: PROG_ORDEN })
    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 5, fecha_ejecucion: '2026-11-09' },
    }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('orden_servicio')
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('EVIDENCIA sin fotos: 400 y no se abre transacción', async () => {
    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'listo' },
    }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('evidencia')
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('EVIDENCIA sin observaciones: 400', async () => {
    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09' },
      files: [FOTO],
    }))

    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('observaciones')
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('sin programación para ese vehículo y esa actividad: 404', async () => {
    prepararPool({ programacion: null })
    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 99, regla_id: 7, fecha_ejecucion: '2026-11-09' },
    }))

    expect(res.codigo).toBe(404)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test.each([[undefined], [''], ['2026-02-31'], ['ayer']])(
    'fecha de ejecución inválida (%p): 400', async valor => {
      const { res } = await llamar(ctrl.registrar, reqFalso({
        body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: valor },
      }))
      expect(res.codigo).toBe(400)
      expect(res.cuerpo.campo).toBe('fecha_ejecucion')
    })

  // Una ejecución futura no es una preferencia de programación: es un dato
  // imposible que además adelantaría la próxima fecha y dejaría el tablero
  // diciendo que está al día algo que nadie hizo.
  test('fecha de ejecución futura: 400', async () => {
    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-10' },
    }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('fecha_ejecucion')
  })

  // El talonario físico tiene formatos viejos, así que no se le impone patrón:
  // solo se recorta a lo que cabe en la columna.
  test('la orden de servicio se acepta con cualquier formato y se recorta a 40', async () => {
    prepararPool({ programacion: PROG_ORDEN })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    const larga = 'OS-' + 'X'.repeat(60)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 5, fecha_ejecucion: '2026-11-09', orden_servicio: larga },
    }))

    expect(res.codigo).toBe(201)
    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins.params[6]).toBe(larga.slice(0, 40))
    expect(ins.params[6].length).toBe(40)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('registrar: el registro es historia, no un apuntador', () => {
  test('guarda copia del nombre, el tipo de registro y la periodicidad vigentes', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins).toBeDefined()
    // Columnas explícitas: la copia tiene que verse en el SQL.
    expect(ins.sql).toMatch(/actividad_nombre/)
    expect(ins.sql).toMatch(/tipo_registro/)
    expect(ins.sql).toMatch(/periodicidad_dias/)
    expect(ins.params.slice(0, 5)).toEqual([4, 7, 'Desinfección choque', 'EVIDENCIA', 15])
  })

  test('la periodicidad guardada es la de la regla, no la que mande el cuerpo', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: {
        vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho',
        periodicidad_dias: 999, tipo_registro: 'ORDEN_SERVICIO', actividad_nombre: 'Otra cosa',
      },
      files: [FOTO],
    }))

    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins.params[2]).toBe('Desinfección choque')
    expect(ins.params[3]).toBe('EVIDENCIA')
    expect(ins.params[4]).toBe(15)
  })

  // Cuándo tocaba y qué tan tarde se hizo, para medir cumplimiento sin
  // recalcular el pasado.
  test('dias_atraso es negativo cuando se ejecuta antes de la fecha programada', async () => {
    prepararPool({ programacion: { ...PROG_EVIDENCIA, fecha_prox: '2026-11-12' } })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins.params[8]).toBe('2026-11-12')   // fecha_programada
    expect(ins.params[9]).toBe(-3)             // dias_atraso
  })

  test('dias_atraso es positivo cuando se ejecuta después', async () => {
    prepararPool({ programacion: { ...PROG_EVIDENCIA, fecha_prox: '2026-11-05' } })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins.params[9]).toBe(4)
  })

  test('sin fecha programada previa, dias_atraso queda en null', async () => {
    prepararPool({ programacion: { ...PROG_EVIDENCIA, estado: 'PENDIENTE', fecha_prox: null } })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const ins = conn.consultaCon('INSERT INTO h360_desinf_registro')
    expect(ins.params[8]).toBeNull()
    expect(ins.params[9]).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('registrar: la próxima fecha es una propuesta', () => {
  test('sin fecha_prox en el cuerpo, propone ejecución + periodicidad', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const upd = conn.consultaCon('UPDATE h360_desinf_programacion')
    expect(upd.params).toEqual(['2026-11-09', 900, '2026-11-24', 10])
    expect(res.cuerpo.programacion.fecha_prox).toBe('2026-11-24')
    expect(res.cuerpo.programacion.estado).toBe('PROGRAMADA')
  })

  test('la fecha_prox del cuerpo manda sobre la propuesta', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: {
        vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09',
        observaciones: 'Hecho', fecha_prox: '2026-11-30',
      },
      files: [FOTO],
    }))

    const upd = conn.consultaCon('UPDATE h360_desinf_programacion')
    expect(upd.params[2]).toBe('2026-11-30')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('registrar: reactivación del vehículo', () => {
  const INACTIVO_POR_DESINFECCION = {
    ...PROG_EVIDENCIA, estado: 'VENCIDA', activo: 0,
    inactivo_origen: 'DESINFECCION', inactivo_motivo: 'Desinfección choque vencida',
  }

  test('sube el vehículo que el módulo bajó cuando ya no le quedan vencidas', async () => {
    prepararPool({ programacion: INACTIVO_POR_DESINFECCION })
    const conn = connDoble({ vencidas: 0 })
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.codigo).toBe(201)
    expect(res.cuerpo.vehiculo_reactivado).toBe(true)
    const upd = conn.consultaCon('UPDATE vehiculos')
    expect(upd).toBeDefined()
    // Al reactivar se limpia el por qué estaba abajo: si no, la pantalla
    // seguiría mostrando el motivo de un vehículo que ya está en servicio.
    for (const col of ['inactivo_origen', 'inactivo_motivo', 'inactivo_at', 'inactivo_por'])
      expect(upd.sql).toMatch(new RegExp(`${col}\\s*=\\s*NULL`))
  })

  // ESTA es la prueba importante del archivo: registrar una desinfección no
  // arregla un carro accidentado, y levantarlo lo pondría a disposición de un
  // homenaje.
  test('NO sube el vehículo bajado a mano (inactivo_origen = MANUAL)', async () => {
    prepararPool({
      programacion: {
        ...INACTIVO_POR_DESINFECCION,
        inactivo_origen: 'MANUAL', inactivo_motivo: 'Choque en la 20 — en el taller',
      },
    })
    const conn = connDoble({ vencidas: 0 })
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.codigo).toBe(201)
    expect(res.cuerpo.vehiculo_reactivado).toBe(false)
    expect(conn.consultaCon('UPDATE vehiculos')).toBeUndefined()
  })

  test('NO sube el vehículo si le quedan otras programaciones vencidas', async () => {
    prepararPool({ programacion: INACTIVO_POR_DESINFECCION })
    const conn = connDoble({ vencidas: 2 })
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.cuerpo.vehiculo_reactivado).toBe(false)
    expect(conn.consultaCon('UPDATE vehiculos')).toBeUndefined()
  })

  test('no toca el vehículo que ya está activo', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.cuerpo.vehiculo_reactivado).toBe(false)
    expect(conn.consultaCon('UPDATE vehiculos')).toBeUndefined()
    expect(conn.consultaCon('AS vencidas')).toBeUndefined()
  })

  // Aunque la lectura de arriba quedara vieja, la base no puede subir un
  // vehículo que alguien bajó a mano.
  test('el UPDATE lleva la guarda del origen en el WHERE', async () => {
    prepararPool({ programacion: INACTIVO_POR_DESINFECCION })
    const conn = connDoble({ vencidas: 0 })
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const upd = conn.consultaCon('UPDATE vehiculos')
    expect(upd.sql).toMatch(/WHERE id = \? AND activo = 0 AND inactivo_origen = 'DESINFECCION'/)
  })

  // El conteo tiene que mirar el estado ya actualizado: esta fila acaba de
  // salir de VENCIDA y no puede contarse contra sí misma.
  test('la programación se actualiza antes de contar las vencidas', async () => {
    prepararPool({ programacion: INACTIVO_POR_DESINFECCION })
    const conn = connDoble({ vencidas: 0 })
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    const orden = conn.consultas.map(q => q.sql)
    const iUpdate = orden.findIndex(s => /UPDATE h360_desinf_programacion/i.test(s))
    const iConteo = orden.findIndex(s => /AS vencidas/i.test(s))
    expect(iUpdate).toBeGreaterThanOrEqual(0)
    expect(iConteo).toBeGreaterThan(iUpdate)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('registrar: evidencias y transacción', () => {
  test('las evidencias se guardan con la conexión de la transacción', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(evidencia.guardarEvidencias).toHaveBeenCalledWith({
      conn,
      registroId: 900,
      archivos: [FOTO],
      placa: 'WGY123',
      actividadNombre: 'Desinfección choque',
      fechaEjecucion: '2026-11-09',
    })
  })

  // El middleware puede estar montado con .array() o con .fields(): el
  // controlador no depende de cuál.
  test('acepta los archivos como objeto por campo, no solo como arreglo', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    const { res } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: { evidencia: [FOTO] },
    }))

    expect(res.codigo).toBe(201)
    expect(evidencia.guardarEvidencias.mock.calls[0][0].archivos).toEqual([FOTO])
  })

  test('la copia a Drive se dispara después del commit y sin esperarla', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evidencia.enviarEvidenciasADrive.mockImplementation(() => {
      expect(conn.commits).toBe(1)
    })

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(evidencia.enviarEvidenciasADrive).toHaveBeenCalledWith(900)
  })

  test('si la copia a Drive falla, la respuesta sigue siendo 201', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evidencia.enviarEvidenciasADrive.mockRejectedValue(new Error('n8n caído'))

    const { res, next } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.codigo).toBe(201)
    expect(next).not.toHaveBeenCalled()
  })

  test('si la copia a Drive revienta de una, la respuesta sigue siendo 201', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evidencia.enviarEvidenciasADrive.mockImplementation(() => { throw new Error('mal montado') })

    const { res, next } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(res.codigo).toBe(201)
    expect(next).not.toHaveBeenCalled()
  })

  // Si algo falla a mitad, la base se deshace y los archivos ya escritos se
  // borran: una foto en disco sin fila que la nombre no la limpia nadie.
  test('si falla el update de la programación: rollback, descarte y release', async () => {
    const conn = connDoble({ fallaEn: 'UPDATE h360_desinf_programacion' })
    db.getConnection.mockResolvedValue(conn)

    const { next } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(conn.rollbacks).toBe(1)
    expect(conn.commits).toBe(0)
    expect(conn.liberada).toBe(true)
    expect(evidencia.descartarEvidencias)
      .toHaveBeenCalledWith(['/datos/uploads/desinf/2026/uno.jpg'])
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'fallo simulado de base' }))
  })

  test('si falla el insert del registro no hay nada que descartar', async () => {
    const conn = connDoble({ fallaEn: 'INSERT INTO h360_desinf_registro' })
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(conn.rollbacks).toBe(1)
    expect(conn.liberada).toBe(true)
    expect(evidencia.descartarEvidencias).not.toHaveBeenCalled()
  })

  test('si el que falla es el guardado de evidencias, se deshace la transacción', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    evidencia.guardarEvidencias.mockRejectedValue(new Error('disco lleno'))

    const { next } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(conn.rollbacks).toBe(1)
    expect(conn.liberada).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  // Si el commit pasó y lo que falló fue leer la respuesta, los archivos ya
  // tienen su fila en la base: borrarlos dejaría el registro sin evidencia.
  test('después del commit no se descartan las evidencias aunque falle la lectura', async () => {
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)
    db.query.mockImplementation(async sql => {
      if (/FROM h360_desinf_programacion p/i.test(sql)) return [[PROG_EVIDENCIA]]
      if (/FROM h360_desinf_registro reg/i.test(sql)) throw new Error('se cayó la lectura')
      return [[]]
    })

    const { next } = await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(conn.commits).toBe(1)
    expect(conn.rollbacks).toBe(0)
    expect(evidencia.descartarEvidencias).not.toHaveBeenCalled()
    expect(conn.liberada).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  test('la conexión se libera siempre', async () => {
    const conn = connDoble({ fallaEn: 'UPDATE vehiculos' })
    db.getConnection.mockResolvedValue(conn)
    prepararPool({
      programacion: { ...PROG_EVIDENCIA, activo: 0, inactivo_origen: 'DESINFECCION' },
    })

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 7, fecha_ejecucion: '2026-11-09', observaciones: 'Hecho' },
      files: [FOTO],
    }))

    expect(conn.liberada).toBe(true)
  })

  test('sin archivos no se llama al servicio de evidencia', async () => {
    prepararPool({ programacion: PROG_ORDEN })
    const conn = connDoble()
    db.getConnection.mockResolvedValue(conn)

    await llamar(ctrl.registrar, reqFalso({
      body: { vehiculo_id: 4, regla_id: 5, fecha_ejecucion: '2026-11-09', orden_servicio: '00123' },
    }))

    expect(evidencia.guardarEvidencias).not.toHaveBeenCalled()
    expect(evidencia.enviarEvidenciasADrive).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('tablero', () => {
  beforeEach(() => { db.query.mockResolvedValue([[]]) })

  // fecha_prox y fecha_ult son DATE. Devueltas como objeto, Express las
  // serializa en UTC y en Colombia la pantalla muestra el día anterior: una
  // limpieza del 12 sale como 11.
  test('las fechas se formatean en SQL, no se mandan como Date', async () => {
    await llamar(ctrl.tablero, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/DATE_FORMAT\(p\.fecha_prox, *'%Y-%m-%d'\) AS fecha_prox/)
    expect(sql).toMatch(/DATE_FORMAT\(p\.fecha_ult, *'%Y-%m-%d'\) AS fecha_ult/)
  })

  // CURDATE() es el día del motor de MySQL. Si la base queda en un contenedor
  // en UTC, después de las 19:00 de Cúcuta ya es mañana y el tablero entero se
  // corre un día.
  test('el día contra el que se compara lo manda el servidor, no CURDATE()', async () => {
    await llamar(ctrl.tablero, reqFalso())
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).not.toMatch(/CURDATE\(\)/)
    expect(sql).toMatch(/DATEDIFF\(p\.fecha_prox, \?\) AS dias_para_vencer/)
    expect(params[0]).toBe(HOY_BOGOTA)
  })

  test('trae el por qué está abajo el vehículo, no solo la bandera', async () => {
    await llamar(ctrl.tablero, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/v\.activo/)
    expect(sql).toMatch(/v\.inactivo_origen/)
    expect(sql).toMatch(/v\.inactivo_motivo/)
  })

  test.each([
    ['tipo',        { tipo: 'CARROZA' },     'v.tipo = ?',         'CARROZA'],
    ['estado',      { estado: 'VENCIDA' },   'p.estado = ?',       'VENCIDA'],
    ['vehiculo_id', { vehiculo_id: '4' },    'p.vehiculo_id = ?',  4],
  ])('filtra por %s', async (_, query, trozo, valor) => {
    await llamar(ctrl.tablero, reqFalso({ query }))
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain(trozo)
    expect(params).toContain(valor)
  })

  // El estado lo mueve un barrido. Si todavía no corrió, la fila de ayer
  // seguiría diciendo PROGRAMADA y se esconderían justo las que se buscan.
  test('solo_vencidas incluye las que ya pasaron de fecha aunque nadie las marcara', async () => {
    await llamar(ctrl.tablero, reqFalso({ query: { solo_vencidas: '1' } }))
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toMatch(/p\.estado = 'VENCIDA' OR/)
    expect(sql).toMatch(/p\.fecha_prox < \?/)
    expect(sql).toMatch(/p\.estado <> 'NO_APLICA'/)
    expect(params.filter(p => p === HOY_BOGOTA).length).toBe(2)
  })

  test('un tipo que no existe se rechaza en vez de devolver un tablero vacío', async () => {
    const { res } = await llamar(ctrl.tablero, reqFalso({ query: { tipo: 'MOTO' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('tipo')
    expect(db.query).not.toHaveBeenCalled()
  })

  test('las vencidas salen primero', async () => {
    await llamar(ctrl.tablero, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/ORDER BY FIELD\(p\.estado, 'VENCIDA'/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('listarRegistros', () => {
  beforeEach(() => { db.query.mockResolvedValue([[]]) })

  test('las fechas se formatean en SQL', async () => {
    await llamar(ctrl.listarRegistros, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/DATE_FORMAT\(reg\.fecha_ejecucion, *'%Y-%m-%d'\) AS fecha_ejecucion/)
    expect(sql).toMatch(/DATE_FORMAT\(reg\.fecha_programada, *'%Y-%m-%d'\) AS fecha_programada/)
  })

  test('el historial se topa en 200', async () => {
    await llamar(ctrl.listarRegistros, reqFalso())
    expect(db.query.mock.calls[0][0]).toMatch(/LIMIT 200/)
  })

  test('filtra por vehículo, rango y actividad', async () => {
    await llamar(ctrl.listarRegistros, reqFalso({
      query: { vehiculo_id: '4', desde: '2026-10-01', hasta: '2026-11-09', actividad: 'choque' },
    }))
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('reg.vehiculo_id = ?')
    expect(sql).toContain('reg.fecha_ejecucion >= ?')
    expect(sql).toContain('reg.fecha_ejecucion <= ?')
    expect(sql).toContain('reg.actividad_nombre LIKE ?')
    expect(params).toEqual([4, '2026-10-01', '2026-11-09', '%choque%'])
  })

  test('una fecha inválida se rechaza', async () => {
    const { res } = await llamar(ctrl.listarRegistros, reqFalso({ query: { desde: '01/10/2026' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('desde')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('actualizarProgramacion: la fecha se programa, no se calcula', () => {
  const PROG = { ...PROG_EVIDENCIA, fecha_ult: '2026-10-21', periodicidad_dias: 15 }

  function prepararUna(programacion = PROG) {
    const actualizaciones = []
    db.query.mockImplementation(async (sql, params) => {
      if (/^UPDATE/i.test(sql.trim())) { actualizaciones.push({ sql, params }); return [{ affectedRows: 1 }] }
      if (/FROM h360_desinf_programacion p/i.test(sql)) return [programacion ? [programacion] : []]
      return [[]]
    })
    return actualizaciones
  }

  // En la hoja original reparten un vehículo por día a propósito y una
  // actividad de 15 días llega a 31. Bloquearlo pelearía con cómo trabajan.
  test('avisa cuando el salto pasa la periodicidad, pero guarda igual', async () => {
    const updates = prepararUna()
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-11-21' },   // 31 días desde el 21-oct
    }))

    expect(res.codigo).toBe(200)
    expect(res.cuerpo.aviso).toMatch(/31 días/)
    expect(res.cuerpo.aviso).toMatch(/cada 15 días/)
    expect(updates).toHaveLength(1)
    expect(updates[0].params[1]).toBe('2026-11-21')
  })

  test('no avisa cuando el salto cabe en la periodicidad', async () => {
    prepararUna()
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-11-04' },   // 14 días
    }))
    expect(res.cuerpo.aviso).toBeNull()
  })

  test('una fecha futura deja la fila PROGRAMADA', async () => {
    const updates = prepararUna()
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-11-20' },
    }))
    expect(updates[0].params[0]).toBe('PROGRAMADA')
  })

  // Un PROGRAMADA con fecha de ayer es una mentira que el tablero repetiría.
  test('una fecha anterior a hoy deja la fila VENCIDA', async () => {
    const updates = prepararUna()
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-11-01', estado: 'PROGRAMADA' },
    }))
    expect(updates[0].params[0]).toBe('VENCIDA')
  })

  test('hoy no está vencida', async () => {
    const updates = prepararUna()
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: HOY_BOGOTA },
    }))
    expect(updates[0].params[0]).toBe('PROGRAMADA')
  })

  // Es la celda que en la hoja decía «REALIZA OLIVOS» metida dentro de la
  // fecha: sin el motivo, la fila dice que no aplica y nadie sabe por qué.
  test('NO_APLICA sin motivo: 400', async () => {
    prepararUna()
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { estado: 'NO_APLICA' },
    }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('observaciones')
  })

  test('NO_APLICA con motivo guarda el motivo y borra la fecha', async () => {
    const updates = prepararUna()
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' },
      body: { estado: 'NO_APLICA', observaciones: 'La hace Olivos' },
    }))
    expect(updates[0].params.slice(0, 3)).toEqual(['NO_APLICA', null, 'La hace Olivos'])
  })

  // Si corregir la redacción del motivo moviera el estado, el NO_APLICA se
  // caería solo y la fila volvería al aviso diario sin que nadie lo pidiera.
  test('corregir solo el motivo no saca la fila de NO_APLICA', async () => {
    const updates = prepararUna({ ...PROG, estado: 'NO_APLICA', fecha_prox: null })
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { observaciones: 'La hace Olivos (sede)' },
    }))

    expect(res.codigo).toBe(200)
    expect(updates[0].params.slice(0, 3)).toEqual(['NO_APLICA', null, 'La hace Olivos (sede)'])
  })

  test('corregir solo el motivo tampoco mueve una PROGRAMADA', async () => {
    const updates = prepararUna({ ...PROG, estado: 'PROGRAMADA', fecha_prox: '2026-11-20' })
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { observaciones: 'Confirmado con el lavadero' },
    }))
    expect(updates[0].params.slice(0, 2)).toEqual(['PROGRAMADA', '2026-11-20'])
  })

  test('se puede volver de NO_APLICA a PENDIENTE', async () => {
    const updates = prepararUna({ ...PROG, estado: 'NO_APLICA', fecha_prox: null })
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { estado: 'PENDIENTE' },
    }))
    expect(updates[0].params[0]).toBe('PENDIENTE')
    expect(updates[0].params[1]).toBeNull()
  })

  test('se puede volver de NO_APLICA a PROGRAMADA con una fecha', async () => {
    const updates = prepararUna({ ...PROG, estado: 'NO_APLICA', fecha_prox: null })
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { estado: 'PROGRAMADA', fecha_prox: '2026-11-20' },
    }))
    expect(updates[0].params[0]).toBe('PROGRAMADA')
    expect(updates[0].params[1]).toBe('2026-11-20')
  })

  test('guarda quién programó y cuándo, con NOW() de la base', async () => {
    const updates = prepararUna()
    await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-11-20' },
    }))
    expect(updates[0].sql).toMatch(/programada_at = NOW\(\)/)
    expect(updates[0].params[3]).toBe('COORD1')
  })

  test('programación que no existe: 404 y no se escribe', async () => {
    const updates = prepararUna(null)
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '77' }, body: { fecha_prox: '2026-11-20' },
    }))
    expect(res.codigo).toBe(404)
    expect(updates).toHaveLength(0)
  })

  test('sin nada que cambiar: 400 y no se consulta la base', async () => {
    prepararUna()
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: {},
    }))
    expect(res.codigo).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('una fecha imposible se rechaza', async () => {
    prepararUna()
    const { res } = await llamar(ctrl.actualizarProgramacion, reqFalso({
      params: { id: '10' }, body: { fecha_prox: '2026-02-31' },
    }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('fecha_prox')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('pendientes: la ventana la decide el servidor', () => {
  const FILA = {
    id: 10, vehiculo_id: 4, regla_id: 7, estado: 'VENCIDA', placa: 'WGY123', tipo: 'TRASLADO',
    actividad: 'Desinfección choque', periodicidad_dias: 15, tipo_registro: 'EVIDENCIA',
    fecha_prox: '2026-11-05', fecha_ult: '2026-10-21', dias_atraso: 4,
  }
  beforeEach(() => { db.query.mockResolvedValue([[FILA]]) })

  // 2026-11-09 20:00Z son las 15:00 de Bogotá: la jornada no ha terminado.
  test('a las 15:00 de Bogotá todavía no es la ventana', async () => {
    const { res } = await llamar(ctrl.pendientes, reqFalso())
    expect(res.cuerpo.en_ventana).toBe(false)
    expect(res.cuerpo.ahora_bogota).toBe('15:00')
  })

  test.each([
    ['las 16:59 de Bogotá', '2026-11-09T21:59:00Z', false, '16:59'],
    ['las 17:00 de Bogotá', '2026-11-09T22:00:00Z', true,  '17:00'],
    ['las 23:59 de Bogotá', '2026-11-10T04:59:00Z', true,  '23:59'],
    ['las 00:05 de Bogotá', '2026-11-10T05:05:00Z', false, '00:05'],
  ])('%s', async (_, instante, esperado, hora) => {
    fijarInstante(new Date(instante))
    const { res } = await llamar(ctrl.pendientes, reqFalso())
    expect(res.cuerpo.en_ventana).toBe(esperado)
    expect(res.cuerpo.ahora_bogota).toBe(hora)
  })

  // La zona va escrita a propósito: en un contenedor en UTC la hora local del
  // proceso ya está cinco horas adelante y la ventana se abriría a las 12 del
  // día de Cúcuta.
  test('la ventana es la misma en procesos que corren en otras zonas', () => {
    const { execFileSync } = require('child_process')
    const ZONAS = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Bogota']
    const script = `
      const c = require(${JSON.stringify(require.resolve('../desinfecciones.controller'))})
      const instante = new Date('2026-11-09T22:30:00Z')
      const salida = {}
      for (const tz of ${JSON.stringify(ZONAS)}) {
        process.env.TZ = tz
        const reloj = c.relojBogota(instante)
        salida[tz] = { reloj, enVentana: c.enVentanaDeAviso(reloj.hora), horaLocal: instante.getHours() }
      }
      console.log(JSON.stringify(salida))`
    const entorno = { ...process.env }
    delete entorno.TZ
    const salida = JSON.parse(execFileSync(process.execPath, ['-e', script],
      { env: entorno, encoding: 'utf8', timeout: 20000 }))

    // Que la prueba tenga con qué fallar: en UTC y en Tokio el reloj local marca
    // otra hora, y con la hora local la ventana daría distinto en cada zona.
    expect(salida['UTC'].horaLocal).toBe(22)
    expect(salida['Asia/Tokyo'].horaLocal).toBe(7)

    for (const tz of ZONAS) {
      expect(salida[tz].reloj).toEqual({ dia: '2026-11-09', hora: '17:30' })
      expect(salida[tz].enVentana).toBe(true)
    }
  })

  // Las de ORDEN_SERVICIO las hace el lavadero: no hay nada que avisarle a
  // nadie a las 17:00.
  test('solo entran las reglas de EVIDENCIA', async () => {
    await llamar(ctrl.pendientes, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/r\.tipo_registro = 'EVIDENCIA'/)
    expect(sql).not.toMatch(/ORDEN_SERVICIO/)
  })

  test('entran las vencidas y las programadas que ya llegaron', async () => {
    await llamar(ctrl.pendientes, reqFalso())
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toMatch(/p\.estado = 'VENCIDA'/)
    expect(sql).toMatch(/p\.estado = 'PROGRAMADA' AND p\.fecha_prox IS NOT NULL AND p\.fecha_prox <= \?/)
    expect(params).toEqual([HOY_BOGOTA, HOY_BOGOTA])
  })

  test('las fechas se formatean en SQL', async () => {
    await llamar(ctrl.pendientes, reqFalso())
    const [sql] = db.query.mock.calls[0]
    expect(sql).toMatch(/DATE_FORMAT\(p\.fecha_prox, *'%Y-%m-%d'\) AS fecha_prox/)
    expect(sql).toMatch(/DATE_FORMAT\(p\.fecha_ult, *'%Y-%m-%d'\) AS fecha_ult/)
  })

  // El asesor ve la lista para saber que la carroza se va a caer —él programa
  // servicios—, pero el botón de registrar no es para él.
  test.each([
    ['asesor',               false],
    ['supervisora',          false],
    ['contabilidad',         false],
    ['asistente_tanatologo', true],
    ['coordinador',          true],
    ['admin',                true],
  ])('puede_registrar para %s es %p', async (rol, esperado) => {
    const { res } = await llamar(ctrl.pendientes, reqFalso({
      user: { usuario: 'U', nombre: 'U', rol },
    }))
    expect(res.cuerpo.pendientes).toHaveLength(1)
    expect(res.cuerpo.pendientes[0].puede_registrar).toBe(esperado)
  })

  test('la lista se devuelve también fuera de la ventana', async () => {
    const { res } = await llamar(ctrl.pendientes, reqFalso())
    expect(res.cuerpo.en_ventana).toBe(false)
    expect(res.cuerpo.pendientes).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('sembrarVehiculo', () => {
  test('crea una fila por regla activa del tipo y no pisa las que ya están', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM vehiculos WHERE id/i.test(sql)) return [[{ id: 4, placa: 'WGY123', tipo: 'TRASLADO' }]]
      if (/^INSERT IGNORE/i.test(sql.trim())) return [{ affectedRows: 1 }]
      if (/AS aplicables/i.test(sql)) return [[{ aplicables: 3 }]]
      return [[]]
    })

    const { res } = await llamar(ctrl.sembrarVehiculo, reqFalso({ params: { id: '4' } }))

    expect(res.cuerpo).toEqual({
      vehiculo_id: 4, placa: 'WGY123', tipo: 'TRASLADO',
      aplicables: 3, creadas: 1, ya_existian: 2,
    })
    const insert = db.query.mock.calls.find(c => /^INSERT IGNORE/i.test(c[0].trim()))
    expect(insert[0]).toMatch(/h360_desinf_programacion/)
    expect(insert[0]).toMatch(/'PENDIENTE', NULL/)
    expect(insert[0]).toMatch(/r\.tipo_vehiculo = \? AND r\.activo = 1/)
    expect(insert[1]).toEqual([4, 'TRASLADO'])
  })

  test('llamarlo dos veces no crea nada la segunda', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM vehiculos WHERE id/i.test(sql)) return [[{ id: 4, placa: 'WGY123', tipo: 'CARROZA' }]]
      if (/^INSERT IGNORE/i.test(sql.trim())) return [{ affectedRows: 0 }]
      if (/AS aplicables/i.test(sql)) return [[{ aplicables: 3 }]]
      return [[]]
    })

    const { res } = await llamar(ctrl.sembrarVehiculo, reqFalso({ params: { id: '4' } }))
    expect(res.cuerpo.creadas).toBe(0)
    expect(res.cuerpo.ya_existian).toBe(3)
  })

  test('vehículo que no existe: 404 y no se siembra nada', async () => {
    db.query.mockResolvedValue([[]])
    const { res } = await llamar(ctrl.sembrarVehiculo, reqFalso({ params: { id: '99' } }))
    expect(res.codigo).toBe(404)
    expect(db.query).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('catálogo de actividades', () => {
  test('sin nombre: 400', async () => {
    const { res } = await llamar(ctrl.crearActividad, reqFalso({ body: { descripcion: 'algo' } }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('nombre')
    expect(db.query).not.toHaveBeenCalled()
  })

  test('nombre repetido: 409 con el id de la que ya está', async () => {
    db.query.mockResolvedValue([[{ id: 3 }]])
    const { res } = await llamar(ctrl.crearActividad, reqFalso({
      body: { nombre: 'Desinfección choque' },
    }))
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.actividad_id).toBe(3)
  })

  test('crea y devuelve la actividad', async () => {
    db.query
      .mockResolvedValueOnce([[]])                                  // no hay duplicada
      .mockResolvedValueOnce([{ insertId: 9 }])                     // insert
      .mockResolvedValueOnce([[{ id: 9, nombre: 'Lavado motor', descripcion: null, activo: 1 }]])
    const { res } = await llamar(ctrl.crearActividad, reqFalso({ body: { nombre: 'Lavado motor' } }))
    expect(res.codigo).toBe(201)
    expect(res.cuerpo.id).toBe(9)
  })

  // Dos personas creando la misma actividad al mismo tiempo: la UNIQUE lo
  // resuelve, y sin traducirlo el usuario recibiría un 500 sin explicación.
  test('la carrera contra la UNIQUE se traduce a 409', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }))
    const { res } = await llamar(ctrl.crearActividad, reqFalso({ body: { nombre: 'Lavado motor' } }))
    expect(res.codigo).toBe(409)
  })

  test('actividad que no existe: 404', async () => {
    db.query.mockResolvedValue([[]])
    const { res } = await llamar(ctrl.actualizarActividad, reqFalso({
      params: { id: '99' }, body: { activo: false },
    }))
    expect(res.codigo).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('reglas: una por actividad y tipo de vehículo', () => {
  function prepararCrear({ actividad = { id: 3, nombre: 'Desinfección choque' }, ya = null } = {}) {
    db.query.mockImplementation(async sql => {
      if (/FROM h360_desinf_actividad WHERE id/i.test(sql)) return [actividad ? [actividad] : []]
      if (/FROM h360_desinf_regla r/i.test(sql) && /r\.actividad_id = \? AND r\.tipo_vehiculo = \?/.test(sql))
        return [ya ? [ya] : []]
      if (/^INSERT/i.test(sql.trim())) return [{ insertId: 12 }]
      if (/FROM h360_desinf_regla r/i.test(sql)) return [[{ id: 12 }]]
      return [[]]
    })
  }

  // Es lo que impide que «choque» quede con dos periodicidades para carroza y
  // nadie sepa cuál rige.
  test('si ya existe la regla para ese tipo: 409 con la que está', async () => {
    prepararCrear({ ya: { id: 7, periodicidad_dias: 15, tipo_registro: 'EVIDENCIA' } })
    const { res } = await llamar(ctrl.crearRegla, reqFalso({
      body: { actividad_id: 3, tipo_vehiculo: 'CARROZA', periodicidad_dias: 30, tipo_registro: 'EVIDENCIA' },
    }))
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.regla.id).toBe(7)
    expect(res.cuerpo.mensaje).toMatch(/CARROZA/)
  })

  test('crea la regla cuando no hay ninguna para ese tipo', async () => {
    prepararCrear()
    const { res } = await llamar(ctrl.crearRegla, reqFalso({
      body: { actividad_id: 3, tipo_vehiculo: 'carroza', periodicidad_dias: '30', tipo_registro: 'evidencia' },
    }))
    expect(res.codigo).toBe(201)
    const insert = db.query.mock.calls.find(c => /^INSERT/i.test(c[0].trim()))
    expect(insert[1]).toEqual([3, 'CARROZA', 30, 'EVIDENCIA', 1])
  })

  test.each([
    ['tipo_vehiculo',     { tipo_vehiculo: 'MOTO' },        'tipo_vehiculo'],
    ['tipo_registro',     { tipo_registro: 'FOTO' },        'tipo_registro'],
    ['periodicidad cero', { periodicidad_dias: 0 },         'periodicidad_dias'],
    ['periodicidad rara', { periodicidad_dias: 'quince' },  'periodicidad_dias'],
    ['periodicidad enorme', { periodicidad_dias: 99999 },   'periodicidad_dias'],
  ])('%s inválido: 400', async (_, parche, campo) => {
    prepararCrear()
    const { res } = await llamar(ctrl.crearRegla, reqFalso({
      body: {
        actividad_id: 3, tipo_vehiculo: 'CARROZA', periodicidad_dias: 30,
        tipo_registro: 'EVIDENCIA', ...parche,
      },
    }))
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe(campo)
  })

  test('actividad inexistente: 404 y no se inserta', async () => {
    prepararCrear({ actividad: null })
    const { res } = await llamar(ctrl.crearRegla, reqFalso({
      body: { actividad_id: 99, tipo_vehiculo: 'CARROZA', periodicidad_dias: 30, tipo_registro: 'EVIDENCIA' },
    }))
    expect(res.codigo).toBe(404)
    expect(db.query.mock.calls.some(c => /^INSERT/i.test(c[0].trim()))).toBe(false)
  })

  // Mover una regla a otra actividad o a otro tipo reinterpretaría en silencio
  // todas las programaciones que ya le apuntan.
  test('actualizar no mueve la regla de actividad ni de tipo de vehículo', async () => {
    db.query.mockImplementation(async sql => {
      if (/FROM h360_desinf_regla r/i.test(sql)) return [[{ id: 7, actividad_id: 3, tipo_vehiculo: 'CARROZA' }]]
      return [{ affectedRows: 1 }]
    })
    await llamar(ctrl.actualizarRegla, reqFalso({
      params: { id: '7' },
      body: { periodicidad_dias: 20, actividad_id: 99, tipo_vehiculo: 'OTRO' },
    }))
    const update = db.query.mock.calls.find(c => /^UPDATE/i.test(c[0].trim()))
    expect(update[1][0]).toEqual({ periodicidad_dias: 20 })
  })

  test('regla que no existe: 404', async () => {
    db.query.mockResolvedValue([[]])
    const { res } = await llamar(ctrl.actualizarRegla, reqFalso({
      params: { id: '99' }, body: { activo: false },
    }))
    expect(res.codigo).toBe(404)
  })
})
