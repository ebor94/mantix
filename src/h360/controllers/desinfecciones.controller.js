/**
 * desinfecciones.controller.js — Seguimiento y control de desinfecciones del
 * parque automotor. Reemplaza la hoja de cálculo «desinfecciones» (pestaña
 * VEHICULOS), donde se llevaba a mano qué le toca a cada vehículo y cuándo.
 *
 * No es la desinfección del traslado de un caso puntual (eso es el F-08): es
 * el mantenimiento sanitario periódico de los vehículos como activos.
 *
 * Las tres decisiones del modelo están escritas en
 * src/scripts/h360_desinfecciones_migration.sql y rigen todo lo de acá:
 *
 *   1. La periodicidad es del par actividad × tipo de vehículo, no de la
 *      actividad: por eso existe h360_desinf_regla y por eso una regla se
 *      identifica por (actividad_id, tipo_vehiculo).
 *   2. La fecha próxima se PROGRAMA, no se calcula. La periodicidad es el techo
 *      con el que se avisa; pasarse de ella devuelve un aviso, nunca un error.
 *   3. El registro es historia: copia el nombre de la actividad, el tipo de
 *      registro y la periodicidad que REGÍAN al ejecutar, y no se sobreescribe.
 *
 * Fechas: toda columna DATE sale formateada en SQL con DATE_FORMAT(x,
 * '%Y-%m-%d'). El pool no tiene `dateStrings`, así que devuelta como objeto
 * Express la serializa en UTC y en Colombia (UTC-5) la pantalla muestra el día
 * anterior. Es el mismo error que ya se cazó en el R-34 con fecha_entrega.
 */
const db = require('../config/db')
const evidencia = require('../services/desinfeccionEvidencia.service')

const texto = (v, max) => String(v ?? '').trim().slice(0, max)
const esVerdadero = v => v === true || v === 1 || v === '1' || v === 'true'

function enteroPositivo(v) {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

const TIPOS_VEHICULO = ['CARROZA', 'TRASLADO', 'OTRO']   // enum de `vehiculos.tipo`
const TIPOS_REGISTRO = ['EVIDENCIA', 'ORDEN_SERVICIO']
const ESTADOS        = ['PENDIENTE', 'PROGRAMADA', 'VENCIDA', 'NO_APLICA']

// 3650 días son diez años. El tope no es de la base (SMALLINT UNSIGNED aguanta
// 65535): es para que un dedazo de un cero no deje una actividad que no vuelve
// a avisar en lo que dura la flota.
const MAX_PERIODICIDAD = 3650

// Quién ejecuta la desinfección. El asesor NO está: ve la lista porque programa
// servicios y necesita saber que la carroza se va a caer, pero no la ejecuta.
// El `asistente` entra acá porque también conduce: en `usuarios.routes.js` los
// conductores son los miembros de LDAP_GROUP_ASIST_TANATOLOGO y
// LDAP_GROUP_ASISTENTE, y la desinfección la ejecuta quien tiene el vehículo.
const ROLES_QUE_REGISTRAN = ['asistente_tanatologo', 'asistente', 'coordinador', 'admin']

// ── Reloj del negocio ──────────────────────────────────────────────────────
//
// La ventana del aviso y el «hoy» con que se compara una fecha programada los
// decide el SERVIDOR y en la zona de Bogotá, dicha a propósito:
//
//  - El navegador no sirve: el reloj y la zona del dispositivo no son
//    confiables, y un celular puesto en otra zona no vería nunca el aviso de
//    las 17:00 o lo vería todo el día.
//  - La hora local del proceso tampoco: hoy el servidor corre en
//    America/Bogota porque la máquina está configurada así, no porque el
//    código lo decida. En un contenedor normalmente corre en UTC, y entonces
//    entre las 19:00 y la medianoche de Cúcuta el proceso ya marca el día
//    siguiente: la ventana se abriría y cerraría cinco horas antes, sin avisar.
const ZONA_NEGOCIO = 'America/Bogota'

// formatToParts y no el texto formateado, para que el resultado no dependa de
// cómo ordene la fecha un idioma. hourCycle h23 para que la hora venga 00..23
// y no «5 PM».
const PARTES_BOGOTA = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_NEGOCIO, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

/** El día (AAAA-MM-DD) y la hora de pared (HH:MM) de Bogotá en un instante. */
function relojBogota(instante = new Date()) {
  const p = Object.fromEntries(PARTES_BOGOTA.formatToParts(instante).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

// De 17:00 a 23:59: la jornada ya terminó y el operario todavía está.
const VENTANA_DESDE = 17 * 60
const VENTANA_HASTA = 23 * 60 + 59

function enVentanaDeAviso(hora) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hora || ''))
  if (!m) return false
  const minutos = +m[1] * 60 + +m[2]
  return minutos >= VENTANA_DESDE && minutos <= VENTANA_HASTA
}

/**
 * «2026-11-09» o cualquier ISO que empiece por una fecha → «2026-11-09».
 * Null si no es una fecha de verdad: el 31 de febrero se descarta comparando
 * contra un Date armado con los mismos números.
 *
 * Se trabaja con el texto y NO con `new Date(...)`: un «2026-11-09» pasado por
 * Date es medianoche UTC, que en Bogotá es el 8.
 */
function fechaSolo(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? '').trim())
  if (!m) return null
  const [, anio, mes, dia] = m
  const prueba = new Date(Date.UTC(+anio, +mes - 1, +dia))
  if (prueba.getUTCFullYear() !== +anio || prueba.getUTCMonth() !== +mes - 1 ||
      prueba.getUTCDate() !== +dia) return null
  return `${anio}-${mes}-${dia}`
}

// Aritmética de calendario en UTC, donde ningún horario de verano mueve el día.
function sumarDias(dia, dias) {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

function diasEntre(desde, hasta) {
  const utc = s => { const [a, m, d] = s.split('-').map(Number); return Date.UTC(a, m - 1, d) }
  return Math.round((utc(hasta) - utc(desde)) / 86400000)
}

/**
 * Los archivos de evidencia, venga el middleware montado con .array() (un
 * arreglo) o con .fields() (un objeto por campo). Se aplana para que el
 * controlador no dependa de cómo se monte la ruta.
 */
function archivosDe(req) {
  const f = req.files
  if (!f) return []
  if (Array.isArray(f)) return f
  return Object.values(f).flat().filter(Boolean)
}

// ═══════════════════════════════════════════════════════════════════════════
// Catálogo de actividades
// ═══════════════════════════════════════════════════════════════════════════

// GET /desinfecciones/actividades  ?activo=1
async function listarActividades(req, res, next) {
  try {
    const filtros = []
    const params  = []
    if (req.query?.activo !== undefined) {
      filtros.push('a.activo = ?')
      params.push(esVerdadero(req.query.activo) ? 1 : 0)
    }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''

    // El conteo de reglas va aquí para que la pantalla del catálogo pueda
    // advertir antes de inactivar una actividad que todavía tiene reglas.
    const [rows] = await db.query(
      `SELECT a.id, a.nombre, a.descripcion, a.activo,
              (SELECT COUNT(*) FROM h360_desinf_regla r WHERE r.actividad_id = a.id) AS reglas
         FROM h360_desinf_actividad a ${where}
        ORDER BY a.activo DESC, a.nombre`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

async function traerActividad(id) {
  const [[a]] = await db.query(
    'SELECT id, nombre, descripcion, activo FROM h360_desinf_actividad WHERE id = ?', [id])
  return a || null
}

// POST /desinfecciones/actividades
async function crearActividad(req, res, next) {
  try {
    const nombre = texto(req.body?.nombre, 80)
    if (!nombre)
      return res.status(400).json({ mensaje: 'Falta el nombre de la actividad', campo: 'nombre' })

    const [dup] = await db.query('SELECT id FROM h360_desinf_actividad WHERE nombre = ?', [nombre])
    if (dup.length)
      return res.status(409).json({
        mensaje: `Ya existe una actividad llamada «${nombre}».`,
        actividad_id: dup[0].id,
      })

    const [r] = await db.query(
      'INSERT INTO h360_desinf_actividad (nombre, descripcion, activo) VALUES (?,?,?)',
      [nombre, texto(req.body?.descripcion, 300) || null,
       req.body?.activo === undefined || esVerdadero(req.body.activo) ? 1 : 0])

    res.status(201).json(await traerActividad(r.insertId))
  } catch (err) {
    // La comprobación de arriba cubre el caso normal. Esta cubre a dos personas
    // creando la misma actividad al mismo tiempo: la UNIQUE lo resuelve, y sin
    // traducirlo el usuario recibiría un 500 sin explicación.
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Ya existe una actividad con ese nombre.' })
    next(err)
  }
}

// PATCH /desinfecciones/actividades/:id
async function actualizarActividad(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de actividad inválido' })
    if (!await traerActividad(id)) return res.status(404).json({ mensaje: 'Actividad no encontrada' })

    const campos = {}
    if (req.body?.nombre !== undefined) {
      const nombre = texto(req.body.nombre, 80)
      if (!nombre)
        return res.status(400).json({ mensaje: 'El nombre de la actividad no puede quedar vacío', campo: 'nombre' })
      const [dup] = await db.query(
        'SELECT id FROM h360_desinf_actividad WHERE nombre = ? AND id <> ?', [nombre, id])
      if (dup.length)
        return res.status(409).json({ mensaje: `Ya existe otra actividad llamada «${nombre}».` })
      campos.nombre = nombre
    }
    if (req.body?.descripcion !== undefined) campos.descripcion = texto(req.body.descripcion, 300) || null
    if (req.body?.activo      !== undefined) campos.activo      = esVerdadero(req.body.activo) ? 1 : 0
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE h360_desinf_actividad SET ? WHERE id = ?', [campos, id])
    res.json(await traerActividad(id))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Ya existe otra actividad con ese nombre.' })
    next(err)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Reglas: la matriz actividad × tipo de vehículo
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_REGLA = `
  SELECT r.id, r.actividad_id, a.nombre AS actividad, r.tipo_vehiculo,
         r.periodicidad_dias, r.tipo_registro, r.activo
    FROM h360_desinf_regla r
    JOIN h360_desinf_actividad a ON a.id = r.actividad_id`

// GET /desinfecciones/reglas  ?actividad_id=&tipo_vehiculo=&activo=
async function listarReglas(req, res, next) {
  try {
    const q = req.query || {}
    const filtros = []
    const params  = []

    if (q.actividad_id !== undefined) {
      const actividadId = enteroPositivo(q.actividad_id)
      if (!actividadId)
        return res.status(400).json({ mensaje: 'actividad_id inválido', campo: 'actividad_id' })
      filtros.push('r.actividad_id = ?'); params.push(actividadId)
    }
    if (q.tipo_vehiculo) {
      const tipo = texto(q.tipo_vehiculo, 20).toUpperCase()
      if (!TIPOS_VEHICULO.includes(tipo))
        return res.status(400).json({
          mensaje: `El tipo de vehículo debe ser uno de: ${TIPOS_VEHICULO.join(', ')}`,
          campo: 'tipo_vehiculo',
        })
      filtros.push('r.tipo_vehiculo = ?'); params.push(tipo)
    }
    if (q.activo !== undefined) {
      filtros.push('r.activo = ?'); params.push(esVerdadero(q.activo) ? 1 : 0)
    }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `${SELECT_REGLA} ${where} ORDER BY a.nombre, r.tipo_vehiculo`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

async function traerRegla(id) {
  const [[r]] = await db.query(`${SELECT_REGLA} WHERE r.id = ?`, [id])
  return r || null
}

// POST /desinfecciones/reglas
async function crearRegla(req, res, next) {
  try {
    const b = req.body || {}

    const actividadId = enteroPositivo(b.actividad_id)
    if (!actividadId)
      return res.status(400).json({ mensaje: 'Falta la actividad', campo: 'actividad_id' })

    const tipoVehiculo = texto(b.tipo_vehiculo, 20).toUpperCase()
    if (!TIPOS_VEHICULO.includes(tipoVehiculo))
      return res.status(400).json({
        mensaje: `El tipo de vehículo debe ser uno de: ${TIPOS_VEHICULO.join(', ')}`,
        campo: 'tipo_vehiculo',
      })

    const tipoRegistro = texto(b.tipo_registro, 20).toUpperCase()
    if (!TIPOS_REGISTRO.includes(tipoRegistro))
      return res.status(400).json({
        mensaje: `El tipo de registro debe ser uno de: ${TIPOS_REGISTRO.join(', ')}`,
        campo: 'tipo_registro',
      })

    const periodicidad = enteroPositivo(b.periodicidad_dias)
    if (!periodicidad || periodicidad > MAX_PERIODICIDAD)
      return res.status(400).json({
        mensaje: `La periodicidad debe ser un número de días entre 1 y ${MAX_PERIODICIDAD}`,
        campo: 'periodicidad_dias',
      })

    const actividad = await traerActividad(actividadId)
    if (!actividad) return res.status(404).json({ mensaje: 'La actividad no existe' })

    // Una sola regla por actividad y tipo: es lo que impide que «choque» quede
    // con dos periodicidades para carroza y nadie sepa cuál rige. Se avisa con
    // la regla que ya está para que la pantalla ofrezca editarla.
    const [[ya]] = await db.query(
      `${SELECT_REGLA} WHERE r.actividad_id = ? AND r.tipo_vehiculo = ?`,
      [actividadId, tipoVehiculo])
    if (ya)
      return res.status(409).json({
        mensaje: `«${actividad.nombre}» ya tiene una regla para ${tipoVehiculo} ` +
                 `(cada ${ya.periodicidad_dias} días). Edítala en vez de crear otra.`,
        regla: ya,
      })

    const [r] = await db.query(
      `INSERT INTO h360_desinf_regla
         (actividad_id, tipo_vehiculo, periodicidad_dias, tipo_registro, activo)
       VALUES (?,?,?,?,?)`,
      [actividadId, tipoVehiculo, periodicidad, tipoRegistro,
       b.activo === undefined || esVerdadero(b.activo) ? 1 : 0])

    res.status(201).json(await traerRegla(r.insertId))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ mensaje: 'Esa actividad ya tiene una regla para ese tipo de vehículo.' })
    next(err)
  }
}

/**
 * PATCH /desinfecciones/reglas/:id
 *
 * Se cambian la periodicidad, el tipo de registro y el activo. NO se mueve la
 * regla a otra actividad ni a otro tipo de vehículo: las programaciones
 * apuntan a la regla, y moverla reinterpretaría en silencio todas las que ya
 * existen (la fila del vehículo de traslado pasaría a ser de otra actividad).
 * Para eso se inactiva esta y se crea la que corresponde.
 */
async function actualizarRegla(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de regla inválido' })
    if (!await traerRegla(id)) return res.status(404).json({ mensaje: 'Regla no encontrada' })

    const b = req.body || {}
    const campos = {}

    if (b.periodicidad_dias !== undefined) {
      const periodicidad = enteroPositivo(b.periodicidad_dias)
      if (!periodicidad || periodicidad > MAX_PERIODICIDAD)
        return res.status(400).json({
          mensaje: `La periodicidad debe ser un número de días entre 1 y ${MAX_PERIODICIDAD}`,
          campo: 'periodicidad_dias',
        })
      campos.periodicidad_dias = periodicidad
    }
    if (b.tipo_registro !== undefined) {
      const tipoRegistro = texto(b.tipo_registro, 20).toUpperCase()
      if (!TIPOS_REGISTRO.includes(tipoRegistro))
        return res.status(400).json({
          mensaje: `El tipo de registro debe ser uno de: ${TIPOS_REGISTRO.join(', ')}`,
          campo: 'tipo_registro',
        })
      campos.tipo_registro = tipoRegistro
    }
    if (b.activo !== undefined) campos.activo = esVerdadero(b.activo) ? 1 : 0
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE h360_desinf_regla SET ? WHERE id = ?', [campos, id])
    res.json(await traerRegla(id))
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sembrar un vehículo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /desinfecciones/vehiculos/:id/sembrar
 *
 * Le crea al vehículo la fila de programación que le corresponde por cada
 * regla activa de su tipo. Idempotente a propósito: se llama cuando entra un
 * vehículo nuevo, cuando se agrega una regla y cuando alguien duda de si el
 * tablero está completo, y en los tres casos lo que ya existe se deja intacto
 * — una programación tiene fecha y estado que nadie quiere pisar.
 */
async function sembrarVehiculo(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de vehículo inválido' })

    const [[veh]] = await db.query('SELECT id, placa, tipo FROM vehiculos WHERE id = ?', [id])
    if (!veh) return res.status(404).json({ mensaje: 'Vehículo no encontrado' })

    // IGNORE y no ON DUPLICATE KEY: acá el único conflicto posible es la UNIQUE
    // (vehiculo_id, regla_id), porque el vehículo se acabó de verificar y los
    // regla_id salen de la misma consulta. Y a diferencia de un UPDATE que no
    // cambia nada, IGNORE no toca `updated_at` de las filas que ya estaban.
    const [r] = await db.query(
      `INSERT IGNORE INTO h360_desinf_programacion (vehiculo_id, regla_id, estado, fecha_prox)
       SELECT ?, r.id, 'PENDIENTE', NULL
         FROM h360_desinf_regla r
        WHERE r.tipo_vehiculo = ? AND r.activo = 1`,
      [veh.id, veh.tipo])
    const creadas = r?.affectedRows || 0

    // Se cuenta DESPUÉS de insertar: así «ya_existían» describe lo que hay, y
    // no la foto de antes de escribir.
    const [[{ aplicables }]] = await db.query(
      `SELECT COUNT(*) AS aplicables
         FROM h360_desinf_programacion p
         JOIN h360_desinf_regla r ON r.id = p.regla_id
        WHERE p.vehiculo_id = ? AND r.tipo_vehiculo = ? AND r.activo = 1`,
      [veh.id, veh.tipo])

    res.json({
      vehiculo_id: veh.id,
      placa: veh.placa,
      tipo: veh.tipo,
      aplicables,
      creadas,
      ya_existian: Math.max(aplicables - creadas, 0),
    })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tablero
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /desinfecciones/tablero  ?tipo=&estado=&vehiculo_id=&solo_vencidas=1
 *
 * Una fila por (vehículo, regla). Es la pantalla que más se va a abrir, así
 * que es una consulta plana contra la programación, que ya trae copiada la
 * última ejecución.
 *
 * `dias_para_vencer` viene con signo: positivo son los días que faltan,
 * negativo los de atraso. El «hoy» contra el que se compara lo manda el
 * servidor en la zona de Bogotá y no se usa CURDATE(), que es el día del
 * motor de MySQL: si la base queda en un contenedor en UTC, después de las
 * 19:00 de Cúcuta CURDATE() ya es mañana y todo el tablero se corre un día.
 */
async function tablero(req, res, next) {
  try {
    const q = req.query || {}
    const { dia: hoy } = relojBogota()

    const filtros = []
    const params  = [hoy]

    if (q.tipo) {
      const tipo = texto(q.tipo, 20).toUpperCase()
      if (!TIPOS_VEHICULO.includes(tipo))
        return res.status(400).json({
          mensaje: `El tipo de vehículo debe ser uno de: ${TIPOS_VEHICULO.join(', ')}`,
          campo: 'tipo',
        })
      filtros.push('v.tipo = ?'); params.push(tipo)
    }
    if (q.estado) {
      const estado = texto(q.estado, 20).toUpperCase()
      if (!ESTADOS.includes(estado))
        return res.status(400).json({
          mensaje: `El estado debe ser uno de: ${ESTADOS.join(', ')}`,
          campo: 'estado',
        })
      filtros.push('p.estado = ?'); params.push(estado)
    }
    if (q.vehiculo_id !== undefined) {
      const vehiculoId = enteroPositivo(q.vehiculo_id)
      if (!vehiculoId)
        return res.status(400).json({ mensaje: 'vehiculo_id inválido', campo: 'vehiculo_id' })
      filtros.push('p.vehiculo_id = ?'); params.push(vehiculoId)
    }
    // Vencida es la que ya pasó su fecha, la haya marcado alguien o no: el
    // estado lo mueve un barrido, y si todavía no corrió, la fila de ayer
    // seguiría diciendo PROGRAMADA y se escondería justo del filtro que la
    // busca. NO_APLICA nunca vence.
    if (esVerdadero(q.solo_vencidas)) {
      filtros.push(`(p.estado = 'VENCIDA' OR (p.estado <> 'NO_APLICA' AND p.fecha_prox IS NOT NULL AND p.fecha_prox < ?))`)
      params.push(hoy)
    }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT p.id, p.vehiculo_id, p.regla_id, p.estado, p.observaciones, p.ultimo_registro_id,
              p.programada_por,
              v.placa, v.tipo, v.activo, v.inactivo_origen, v.inactivo_motivo,
              r.actividad_id, a.nombre AS actividad,
              r.periodicidad_dias, r.tipo_registro, r.activo AS regla_activa,
              DATE_FORMAT(p.fecha_prox, '%Y-%m-%d') AS fecha_prox,
              DATE_FORMAT(p.fecha_ult,  '%Y-%m-%d') AS fecha_ult,
              DATEDIFF(p.fecha_prox, ?) AS dias_para_vencer
         FROM h360_desinf_programacion p
         JOIN h360_desinf_regla r     ON r.id = p.regla_id
         JOIN h360_desinf_actividad a ON a.id = r.actividad_id
         JOIN vehiculos v             ON v.id = p.vehiculo_id
         ${where}
        ORDER BY FIELD(p.estado, 'VENCIDA', 'PROGRAMADA', 'PENDIENTE', 'NO_APLICA'),
                 p.fecha_prox IS NULL, p.fecha_prox, v.placa`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Programar
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_PROGRAMACION = `
  SELECT p.id, p.vehiculo_id, p.regla_id, p.estado, p.observaciones, p.ultimo_registro_id,
         p.programada_por,
         DATE_FORMAT(p.fecha_prox, '%Y-%m-%d') AS fecha_prox,
         DATE_FORMAT(p.fecha_ult,  '%Y-%m-%d') AS fecha_ult,
         v.placa, v.tipo, v.activo, v.inactivo_origen, v.inactivo_motivo,
         r.actividad_id, a.nombre AS actividad, r.periodicidad_dias, r.tipo_registro
    FROM h360_desinf_programacion p
    JOIN h360_desinf_regla r     ON r.id = p.regla_id
    JOIN h360_desinf_actividad a ON a.id = r.actividad_id
    JOIN vehiculos v             ON v.id = p.vehiculo_id`

/**
 * PATCH /desinfecciones/programacion/:id
 * Body: { fecha_prox?, estado?, observaciones? }
 *
 * Mueve la fecha planeada, pasa la fila a NO_APLICA con el motivo, o la trae de
 * vuelta a PENDIENTE/PROGRAMADA.
 *
 * LA FECHA SE PROGRAMA, NO SE CALCULA: en la hoja original reparten un vehículo
 * por día a propósito, y una de las limpiezas de 15 días queda a 31 de la
 * anterior. Si el salto desde la última ejecución pasa la periodicidad se
 * DEVUELVE un `aviso` y se guarda igual. Bloquearlo pelearía con cómo trabajan
 * y acabaría con la gente programando en la hoja otra vez.
 *
 * El estado no se acepta a dedo cuando hay fecha: lo decide la fecha. Un
 * PROGRAMADA con fecha de ayer es una mentira que el tablero repetiría.
 */
async function actualizarProgramacion(req, res, next) {
  try {
    const id = enteroPositivo(req.params?.id)
    if (!id) return res.status(400).json({ mensaje: 'Identificador de programación inválido' })

    const b = req.body || {}
    const pideFecha  = b.fecha_prox !== undefined
    const pideEstado = b.estado !== undefined
    const pideObs    = b.observaciones !== undefined
    if (!pideFecha && !pideEstado && !pideObs)
      return res.status(400).json({ mensaje: 'Nada que actualizar' })

    const [[prog]] = await db.query(`${SELECT_PROGRAMACION} WHERE p.id = ?`, [id])
    if (!prog) return res.status(404).json({ mensaje: 'Programación no encontrada' })

    let estadoPedido = null
    if (pideEstado) {
      estadoPedido = texto(b.estado, 20).toUpperCase()
      if (!ESTADOS.includes(estadoPedido))
        return res.status(400).json({
          mensaje: `El estado debe ser uno de: ${ESTADOS.join(', ')}`,
          campo: 'estado',
        })
    }

    // Qué fecha va a quedar.
    let fechaFinal = prog.fecha_prox || null
    if (pideFecha) {
      if (b.fecha_prox === null || b.fecha_prox === '') fechaFinal = null
      else {
        fechaFinal = fechaSolo(b.fecha_prox)
        if (!fechaFinal)
          return res.status(400).json({ mensaje: 'La fecha programada no es una fecha válida', campo: 'fecha_prox' })
      }
    }

    const observaciones = pideObs ? (texto(b.observaciones, 300) || null) : (prog.observaciones || null)

    // NO_APLICA exige el motivo: es la celda que en la hoja decía «REALIZA
    // OLIVOS» o «ESTABA NO OPERATIVA» metida dentro de la fecha, y sin el
    // motivo la fila queda diciendo que no aplica sin que nadie sepa por qué.
    if (estadoPedido === 'NO_APLICA' && !observaciones)
      return res.status(400).json({
        mensaje: 'Para marcar que no aplica hay que escribir por qué',
        campo: 'observaciones',
      })

    // PENDIENTE y NO_APLICA no llevan fecha planeada: PENDIENTE es «todavía no
    // se programó», y una fecha en algo que no aplica volvería a aparecer en el
    // aviso diario.
    if (estadoPedido === 'PENDIENTE' || estadoPedido === 'NO_APLICA') fechaFinal = null

    let estadoFinal
    if (estadoPedido === 'NO_APLICA') estadoFinal = 'NO_APLICA'
    // Corregir solo el texto no mueve el estado: si no, a un NO_APLICA al que
    // le arreglan la redacción del motivo se le caería el NO_APLICA y volvería
    // al aviso diario sin que nadie lo pidiera.
    else if (!pideEstado && !pideFecha) estadoFinal = prog.estado
    else if (fechaFinal) estadoFinal = fechaFinal < relojBogota().dia ? 'VENCIDA' : 'PROGRAMADA'
    else estadoFinal = 'PENDIENTE'

    let aviso = null
    if (fechaFinal && prog.fecha_ult && prog.periodicidad_dias) {
      const salto = diasEntre(prog.fecha_ult, fechaFinal)
      if (salto > prog.periodicidad_dias)
        aviso = `Quedan ${salto} días entre la última desinfección (${prog.fecha_ult}) y la ` +
                `programada: «${prog.actividad}» es cada ${prog.periodicidad_dias} días. Se guardó igual.`
    }

    // programada_at con NOW() y no con un Date de JavaScript: mysql2 serializa
    // un Date en la zona de la conexión, y es justo el tipo de conversión que
    // corre la hora cinco horas.
    await db.query(
      `UPDATE h360_desinf_programacion
          SET estado = ?, fecha_prox = ?, observaciones = ?, programada_por = ?, programada_at = NOW()
        WHERE id = ?`,
      [estadoFinal, fechaFinal, observaciones, texto(req.user?.usuario, 50) || null, id])

    const [[actualizada]] = await db.query(`${SELECT_PROGRAMACION} WHERE p.id = ?`, [id])
    res.json({ ...actualizada, aviso })
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registrar una ejecución
// ═══════════════════════════════════════════════════════════════════════════

const SELECT_REGISTRO = `
  SELECT reg.id, reg.vehiculo_id, reg.regla_id, reg.actividad_nombre, reg.tipo_registro,
         reg.periodicidad_dias, reg.orden_servicio, reg.observaciones, reg.dias_atraso,
         reg.registrado_por, reg.registrado_nombre,
         DATE_FORMAT(reg.fecha_ejecucion,  '%Y-%m-%d') AS fecha_ejecucion,
         DATE_FORMAT(reg.fecha_programada, '%Y-%m-%d') AS fecha_programada,
         v.placa, v.tipo,
         (SELECT COUNT(*) FROM h360_desinf_evidencia e WHERE e.registro_id = reg.id) AS evidencias
    FROM h360_desinf_registro reg
    LEFT JOIN vehiculos v ON v.id = reg.vehiculo_id`

/**
 * POST /desinfecciones/registro
 * Body: { vehiculo_id, regla_id, fecha_ejecucion, orden_servicio?, observaciones?, fecha_prox? }
 * Las fotos las pone un middleware en `req.files`.
 *
 * Todo lo que se puede rechazar se rechaza ANTES de abrir la transacción:
 * rechazar es barato, rechazar después de haber escrito no, y una foto ya
 * guardada en disco por un registro que no existe es basura que nadie limpia.
 */
async function registrar(req, res, next) {
  let conn = null
  let rutasEscritas = []
  let confirmado = false

  try {
    const b = req.body || {}

    const vehiculoId = enteroPositivo(b.vehiculo_id)
    if (!vehiculoId) return res.status(400).json({ mensaje: 'Falta el vehículo', campo: 'vehiculo_id' })
    const reglaId = enteroPositivo(b.regla_id)
    if (!reglaId) return res.status(400).json({ mensaje: 'Falta la actividad', campo: 'regla_id' })

    const fechaEjecucion = fechaSolo(b.fecha_ejecucion)
    if (!fechaEjecucion)
      return res.status(400).json({
        mensaje: 'Falta la fecha en que se ejecutó la desinfección',
        campo: 'fecha_ejecucion',
      })
    const { dia: hoy } = relojBogota()
    // Una ejecución con fecha futura no es una preferencia de programación: es
    // un dato imposible que además adelantaría la próxima fecha y haría que el
    // tablero diga que está al día algo que nadie hizo.
    if (fechaEjecucion > hoy)
      return res.status(400).json({
        mensaje: 'La fecha de ejecución no puede ser futura',
        campo: 'fecha_ejecucion',
      })

    // Se lee la programación con la regla y el vehículo de una vez: de acá sale
    // el tipo de registro que decide qué se exige, la fecha que tocaba y el
    // motivo por el que el vehículo pueda estar abajo.
    const [[prog]] = await db.query(
      `${SELECT_PROGRAMACION} WHERE p.vehiculo_id = ? AND p.regla_id = ?`,
      [vehiculoId, reglaId])
    if (!prog)
      return res.status(404).json({
        mensaje: 'Ese vehículo no tiene programada esa actividad. Siémbralo primero desde el tablero.',
      })

    const archivos = archivosDe(req)
    // La columna es TEXT: 65535 BYTES, no caracteres. Un tope alto de
    // caracteres se pasaría de largo con acentos o emojis y la base rechazaría
    // el registro entero. 2000 sobran para describir lo que se hizo.
    const observaciones = texto(b.observaciones, 2000) || null
    // Solo se recorta a 40: es el código del talonario físico y el talonario
    // tiene formatos viejos, así que no se le impone ningún patrón.
    const ordenServicio = texto(b.orden_servicio, 40) || null

    if (prog.tipo_registro === 'ORDEN_SERVICIO' && !ordenServicio)
      return res.status(400).json({
        mensaje: `«${prog.actividad}» la hace un tercero y se confirma con el número de la orden de servicio.`,
        campo: 'orden_servicio',
      })

    if (prog.tipo_registro === 'EVIDENCIA') {
      if (!archivos.length)
        return res.status(400).json({
          mensaje: `«${prog.actividad}» exige al menos una foto como evidencia.`,
          campo: 'evidencia',
        })
      if (!observaciones)
        return res.status(400).json({
          mensaje: `«${prog.actividad}» exige escribir las observaciones de lo que se hizo.`,
          campo: 'observaciones',
        })
    }

    // La fecha próxima que venga en el cuerpo manda; si no viene, se PROPONE
    // fecha_ejecucion + periodicidad. Es una propuesta y queda editable: la
    // periodicidad es el techo con el que se avisa, no el calendario.
    let fechaProx = null
    if (b.fecha_prox !== undefined && b.fecha_prox !== null && b.fecha_prox !== '') {
      fechaProx = fechaSolo(b.fecha_prox)
      if (!fechaProx)
        return res.status(400).json({ mensaje: 'La próxima fecha no es una fecha válida', campo: 'fecha_prox' })
    } else if (prog.periodicidad_dias) {
      fechaProx = sumarDias(fechaEjecucion, Number(prog.periodicidad_dias))
    }

    // Cuándo tocaba y qué tan tarde se hizo, para medir cumplimiento sin tener
    // que recalcular el pasado. Negativo = se hizo antes de la fecha.
    const fechaProgramada = prog.fecha_prox || null
    const diasAtraso = fechaProgramada ? diasEntre(fechaProgramada, fechaEjecucion) : null

    conn = await db.getConnection()
    await conn.beginTransaction()

    // Columnas explícitas y valores COPIADOS, no un apuntador a la regla: si
    // mañana cambian «choque» de 15 a 20 días, lo que se ejecutó hace tres
    // meses se cumplió contra 15 y así tiene que leerse en una auditoría. Es la
    // misma razón por la que el R-34 guarda el documento y no una referencia al
    // ERP.
    const [ins] = await conn.query(
      `INSERT INTO h360_desinf_registro
         (vehiculo_id, regla_id, actividad_nombre, tipo_registro, periodicidad_dias,
          fecha_ejecucion, orden_servicio, observaciones, fecha_programada, dias_atraso,
          registrado_por, registrado_nombre)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [vehiculoId, reglaId, prog.actividad, prog.tipo_registro, prog.periodicidad_dias ?? null,
       fechaEjecucion, ordenServicio, observaciones, fechaProgramada, diasAtraso,
       texto(req.user?.usuario, 50), texto(req.user?.nombre, 150) || null])
    const registroId = ins.insertId

    let filasEvidencia = []
    if (archivos.length) {
      const guardado = await evidencia.guardarEvidencias({
        conn,
        registroId,
        archivos,
        placa: prog.placa,
        actividadNombre: prog.actividad,
        fechaEjecucion,
      })
      filasEvidencia = guardado?.filas || []
      rutasEscritas  = guardado?.rutasEscritas || []
    }

    await conn.query(
      `UPDATE h360_desinf_programacion
          SET fecha_ult = ?, ultimo_registro_id = ?, fecha_prox = ?, estado = 'PROGRAMADA'
        WHERE id = ?`,
      [fechaEjecucion, registroId, fechaProx, prog.id])

    // ── Reactivación del vehículo ──────────────────────────────────────────
    //
    // Se sube SOLO lo que el módulo bajó. Si el vehículo está abajo por un
    // choque o por mantenimiento (inactivo_origen = 'MANUAL'), registrar una
    // desinfección no arregla el carro, y levantarlo lo pondría a disposición
    // de un homenaje. Por eso el origen es una columna y no un texto de motivo
    // que haya que adivinar.
    //
    // El UPDATE de la programación va ANTES a propósito: esta fila ya salió de
    // VENCIDA, así que el conteo mira solo lo que todavía le falta.
    let reactivado = false
    if (Number(prog.activo) === 0 && prog.inactivo_origen === 'DESINFECCION') {
      const [[{ vencidas }]] = await conn.query(
        `SELECT COUNT(*) AS vencidas FROM h360_desinf_programacion
          WHERE vehiculo_id = ? AND estado = 'VENCIDA'`, [vehiculoId])

      if (!Number(vencidas)) {
        // Las condiciones se repiten en el WHERE a propósito: aunque la lectura
        // de arriba quedara vieja, la base no puede subir un vehículo que
        // alguien bajó a mano.
        const [upd] = await conn.query(
          `UPDATE vehiculos
              SET activo = 1, inactivo_origen = NULL, inactivo_motivo = NULL,
                  inactivo_at = NULL, inactivo_por = NULL
            WHERE id = ? AND activo = 0 AND inactivo_origen = 'DESINFECCION'`,
          [vehiculoId])
        reactivado = (upd?.affectedRows || 0) > 0
      }
    }

    await conn.commit()
    confirmado = true

    // Después del commit y sin await: la copia a Drive la hace n8n y puede
    // tardar o fallar, y el operario no tiene por qué esperarla ni ver un error
    // por algo que ya quedó guardado en el servidor. El .catch() es obligatorio
    // porque un rechazo sin manejar tumba el proceso.
    if (archivos.length) {
      try {
        Promise.resolve(evidencia.enviarEvidenciasADrive(registroId))
          .catch(e => console.warn('[desinfecciones] evidencias a Drive:', e.message))
      } catch (e) {
        console.warn('[desinfecciones] evidencias a Drive:', e.message)
      }
    }

    const [[registro]] = await db.query(`${SELECT_REGISTRO} WHERE reg.id = ?`, [registroId])

    res.status(201).json({
      registro: registro || { id: registroId },
      // Las filas que se acabaron de escribir, para que la pantalla pinte las
      // miniaturas sin volver a pedir el registro.
      evidencia: filasEvidencia,
      programacion: {
        id: prog.id,
        estado: 'PROGRAMADA',
        fecha_ult: fechaEjecucion,
        fecha_prox: fechaProx,
      },
      vehiculo_reactivado: reactivado,
    })
  } catch (err) {
    // Solo se deshace si no se había confirmado: si el commit pasó y lo que
    // falló fue la lectura de la respuesta, los archivos ya tienen su fila en
    // la base y borrarlos dejaría el registro sin evidencia.
    if (conn && !confirmado) {
      await conn.rollback().catch(() => {})
      if (rutasEscritas.length)
        await evidencia.descartarEvidencias(rutasEscritas).catch(() => {})
    }
    next(err)
  } finally {
    if (conn) conn.release()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Historial
// ═══════════════════════════════════════════════════════════════════════════

// GET /desinfecciones/registros  ?vehiculo_id=&desde=&hasta=&actividad=
async function listarRegistros(req, res, next) {
  try {
    const q = req.query || {}
    const filtros = []
    const params  = []

    if (q.vehiculo_id !== undefined) {
      const vehiculoId = enteroPositivo(q.vehiculo_id)
      if (!vehiculoId)
        return res.status(400).json({ mensaje: 'vehiculo_id inválido', campo: 'vehiculo_id' })
      filtros.push('reg.vehiculo_id = ?'); params.push(vehiculoId)
    }
    if (q.desde) {
      const desde = fechaSolo(q.desde)
      if (!desde) return res.status(400).json({ mensaje: 'La fecha «desde» no es válida', campo: 'desde' })
      filtros.push('reg.fecha_ejecucion >= ?'); params.push(desde)
    }
    if (q.hasta) {
      const hasta = fechaSolo(q.hasta)
      if (!hasta) return res.status(400).json({ mensaje: 'La fecha «hasta» no es válida', campo: 'hasta' })
      filtros.push('reg.fecha_ejecucion <= ?'); params.push(hasta)
    }
    // Por nombre y por contenido: el registro guarda copia del nombre, así que
    // una actividad renombrada sigue encontrándose por como se llamaba.
    if (q.actividad) {
      filtros.push('reg.actividad_nombre LIKE ?')
      params.push(`%${texto(q.actividad, 80)}%`)
    }

    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `${SELECT_REGISTRO}
       ${where}
       ORDER BY reg.fecha_ejecucion DESC, reg.id DESC
       LIMIT 200`, params)
    res.json(rows)
  } catch (err) { next(err) }
}

// ═══════════════════════════════════════════════════════════════════════════
// Aviso del final de la jornada
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /desinfecciones/pendientes
 *
 * Alimenta el popup del operario. EL SERVIDOR DECIDE SI ESTAMOS EN LA VENTANA
 * HORARIA, nunca el navegador: ver la nota de ZONA_NEGOCIO arriba.
 *
 * La lista se devuelve siempre, en ventana o no, y la ventana viaja como
 * bandera: es el mismo dato, y así una pantalla que quiera consultar los
 * pendientes a media mañana no necesita otro endpoint ni puede «abrirse» el
 * popup por su cuenta.
 *
 * Solo entran las reglas de EVIDENCIA, que son las que ejecuta el operario; las
 * de ORDEN_SERVICIO las hace el lavadero y no hay nada que avisarle a nadie a
 * las 17:00.
 */
async function pendientes(req, res, next) {
  try {
    const { dia: hoy, hora } = relojBogota()
    const puedeRegistrar = ROLES_QUE_REGISTRAN.includes(req.user?.rol)

    // `fecha_prox <= hoy` y no `= hoy`: una PROGRAMADA de ayer que nadie marcó
    // VENCIDA es justo la que hay que avisar, y es lo que pasa cualquier día en
    // que el barrido no haya corrido.
    const [rows] = await db.query(
      `SELECT p.id, p.vehiculo_id, p.regla_id, p.estado, p.observaciones,
              v.placa, v.tipo, v.activo, v.inactivo_origen, v.inactivo_motivo,
              r.actividad_id, a.nombre AS actividad, r.periodicidad_dias, r.tipo_registro,
              DATE_FORMAT(p.fecha_prox, '%Y-%m-%d') AS fecha_prox,
              DATE_FORMAT(p.fecha_ult,  '%Y-%m-%d') AS fecha_ult,
              DATEDIFF(?, p.fecha_prox) AS dias_atraso
         FROM h360_desinf_programacion p
         JOIN h360_desinf_regla r     ON r.id = p.regla_id
         JOIN h360_desinf_actividad a ON a.id = r.actividad_id
         JOIN vehiculos v             ON v.id = p.vehiculo_id
        WHERE r.tipo_registro = 'EVIDENCIA' AND r.activo = 1
          AND (p.estado = 'VENCIDA'
               OR (p.estado = 'PROGRAMADA' AND p.fecha_prox IS NOT NULL AND p.fecha_prox <= ?))
        ORDER BY (p.estado = 'VENCIDA') DESC, p.fecha_prox IS NULL, p.fecha_prox, v.placa`,
      [hoy, hoy])

    res.json({
      en_ventana: enVentanaDeAviso(hora),
      ahora_bogota: hora,
      // Por elemento y no una sola vez: el asesor ve la misma lista para saber
      // que la carroza se va a caer, pero el botón de registrar no es para él.
      pendientes: rows.map(p => ({ ...p, puede_registrar: puedeRegistrar })),
    })
  } catch (err) { next(err) }
}

/**
 * GET /publico/desinfecciones/:token — sin sesión, para el televisor del garaje.
 *
 * Responde UNA pregunta: qué vehículo no se puede usar y a cuál le toca algo
 * pronto. Por eso no devuelve el parque completo sino solo lo que está
 * vencido, vence hoy o vence dentro de la ventana de aviso: una pantalla que
 * lista dieciocho placas al día no se lee de lejos, y la que importa se pierde
 * entre las demás.
 *
 * La ventana es la MISMA del aviso diario por Chat (DESINF_AVISO_DIAS). Si
 * fueran distintas, el televisor y el mensaje de la mañana se contradirían y
 * nadie sabría a cuál creerle.
 *
 * Mismo mecanismo de la programación pública: un token compartido en la URL,
 * 404 si no cuadra y 500 si el servidor no lo tiene configurado. No lleva dato
 * personal —placas, actividades y fechas— pero el token igual evita que la
 * dirección se adivine. Es un token PROPIO y no el de la programación: si se
 * filtra uno, no hay que rotar los dos.
 */
async function tableroPublico(req, res, next) {
  try {
    const esperado = process.env.DESINF_PUBLICO_TOKEN
    if (!esperado) return res.status(500).json({ mensaje: 'Servicio no configurado' })
    if (req.params.token !== esperado) return res.status(404).json({ mensaje: 'No encontrado' })

    const { dia: hoy, hora } = relojBogota()
    const diasAviso = diasDeAviso()

    // El «hoy» lo pone el servidor y no CURDATE(): así el televisor y el
    // tablero interno cuentan los días desde la misma fecha.
    const [rows] = await db.query(
      `SELECT v.id AS vehiculo_id, v.placa, v.tipo,
              (v.activo = 0 AND v.inactivo_origen = 'DESINFECCION') AS inhabilitado,
              a.nombre AS actividad,
              DATE_FORMAT(p.fecha_prox, '%Y-%m-%d') AS fecha_prox,
              DATEDIFF(p.fecha_prox, ?) AS dias
         FROM h360_desinf_programacion p
         JOIN h360_desinf_regla r     ON r.id = p.regla_id AND r.activo = 1
         JOIN h360_desinf_actividad a ON a.id = r.actividad_id
         JOIN vehiculos v             ON v.id = p.vehiculo_id
        WHERE p.estado <> 'NO_APLICA'
          AND p.fecha_prox IS NOT NULL
          AND p.fecha_prox <= DATE_ADD(?, INTERVAL ? DAY)
        ORDER BY inhabilitado DESC, p.fecha_prox, v.placa, a.nombre`,
      [hoy, hoy, diasAviso])

    res.json({
      generado: `${hoy} ${hora}`,
      dias_aviso: diasAviso,
      items: rows.map(f => ({
        ...f,
        inhabilitado: !!f.inhabilitado,
        urgencia: f.dias < 0 ? 'VENCIDA' : f.dias === 0 ? 'HOY' : 'PROXIMA',
      })),
    })
  } catch (err) { next(err) }
}

/** La ventana de aviso, con el mismo saneado que usa el job. */
function diasDeAviso() {
  const n = Number(process.env.DESINF_AVISO_DIAS)
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 3
}

module.exports = {
  listarActividades, crearActividad, actualizarActividad,
  listarReglas, crearRegla, actualizarRegla,
  sembrarVehiculo,
  tablero,
  actualizarProgramacion,
  registrar,
  listarRegistros,
  pendientes,
  tableroPublico,
  // Expuestos para las pruebas y para quien tenga que calcular lo mismo.
  relojBogota, enVentanaDeAviso, fechaSolo, sumarDias, diasEntre,
}
