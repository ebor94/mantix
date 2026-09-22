/**
 * homenajes_sala.controller.js
 * Gestión de homenajes en sala (ingreso, visitas, salida) — formato R-22.
 *
 * Regla de inmutabilidad: cualquier bloque con `firma_familiar` no vacía
 * queda BLOQUEADO. Solo admin puede modificar con `motivo` obligatorio;
 * la lógica hace UPSERT del snapshot en `homenaje_sala_auditoria` antes.
 */
const db = require('../config/db')
const { syncFromIngreso, syncFromVisita, syncFromSalida } = require('../services/sync_gestion.service')
const { avanzarPorEvento } = require('./asistencias.controller')

// ── Helpers de bloqueo por firma ────────────────────────────────────────────
function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

function estaFirmado(dataJson) {
  const d = parseJson(dataJson)
  return !!(d && typeof d.firma_familiar === 'string' && d.firma_familiar.trim().length > 20)
}

async function insertarAuditoria(homenaje_sala_id, seccion, accion, snapshot, motivo, req, visita_id = null) {
  const { usuario, nombre } = req.user || {}
  await db.query(
    `INSERT INTO homenaje_sala_auditoria
     (homenaje_sala_id, visita_id, seccion, accion, snapshot_anterior, motivo, usuario_id, nombre_usuario)
     VALUES (?,?,?,?,?,?,?,?)`,
    [homenaje_sala_id, visita_id, seccion, accion,
     snapshot ? JSON.stringify(snapshot) : null,
     motivo || null, usuario, nombre || null]
  )
}

// GET /api/h360/homenajes-sala?asistencia_id=&sala_id=&estado=&page=&limit=
async function listar(req, res, next) {
  try {
    const { asistencia_id, sala_id, estado, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const conds = []
    const params = []
    if (asistencia_id) { conds.push('h.asistencia_id = ?'); params.push(asistencia_id) }
    if (sala_id)       { conds.push('h.sala_id = ?');       params.push(sala_id) }
    // `estado` acepta varios separados por coma (ej. ABIERTO,SALIDA_REGISTRADA),
    // para poder pedir "los que siguen abiertos" en una sola consulta.
    const estados = String(estado || '').split(',').map(e => e.trim()).filter(Boolean)
    if (estados.length === 1) {
      conds.push('h.estado = ?'); params.push(estados[0])
    } else if (estados.length > 1) {
      conds.push(`h.estado IN (${estados.map(() => '?').join(',')})`)
      params.push(...estados)
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT h.id, h.asistencia_id, h.sala_id, h.estado, h.created_by, h.created_at, h.updated_at,
              a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato,
              sv.codigo AS sala_codigo, sv.nombre AS sala_nombre,
              s.nombre AS sede_nombre
       FROM homenajes_sala h
       LEFT JOIN asistencias a    ON a.id = h.asistencia_id
       LEFT JOIN salas_velacion sv ON sv.id = h.sala_id
       LEFT JOIN sedes s          ON s.id = sv.sede_id
       ${where}
       ORDER BY h.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM homenajes_sala h ${where}`, params
    )
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
}

// GET /api/h360/homenajes-sala/:id
async function obtener(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query(
      `SELECT h.*, a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato,
              a.nombre_contacto, a.telefono_contacto,
              sv.codigo AS sala_codigo, sv.nombre AS sala_nombre,
              s.nombre AS sede_nombre, s.codigo AS sede_codigo
       FROM homenajes_sala h
       LEFT JOIN asistencias a    ON a.id = h.asistencia_id
       LEFT JOIN salas_velacion sv ON sv.id = h.sala_id
       LEFT JOIN sedes s          ON s.id = sv.sede_id
       WHERE h.id = ?`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    const homenaje = rows[0]

    const [visitas] = await db.query(
      `SELECT * FROM homenaje_sala_visitas WHERE homenaje_sala_id = ? ORDER BY numero_visita ASC`,
      [id]
    )
    homenaje.visitas = visitas

    // Exequias programadas para la misma asistencia (hora, lugar, parroquia).
    const [exequias] = await db.query(
      `SELECT e.id, e.tipo, e.fecha, e.hora, e.lugar, e.barrio, e.parroquia,
              e.direccion, e.estado, e.conductor_id, v.placa AS vehiculo_placa
         FROM exequias e
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
        WHERE e.asistencia_id = ?
        ORDER BY e.fecha, e.hora`,
      [homenaje.asistencia_id]
    )
    homenaje.exequias = exequias

    // Familiar que recibió el encuentro (F-05). Puede no existir aún.
    const [[f05]] = await db.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(datos, '$.nombre_familiar')) AS nombre_familiar,
              completado
         FROM asistencia_etapas
        WHERE asistencia_id = ? AND etapa = 'F05_ENTREGA'`,
      [homenaje.asistencia_id]
    )
    homenaje.familiar_encuentro = (f05?.nombre_familiar || '').trim() || null
    homenaje.encuentro_cerrado  = f05?.completado === 1

    res.json(homenaje)
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-sala
async function crear(req, res, next) {
  try {
    const { usuario } = req.user
    const { asistencia_id, sala_id, observaciones_generales } = req.body
    if (!asistencia_id || !sala_id) {
      return res.status(400).json({ mensaje: 'asistencia_id y sala_id son obligatorios' })
    }

    // Verificar existencia
    const [[asis]] = await db.query('SELECT id FROM asistencias WHERE id = ?', [asistencia_id])
    if (!asis) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    const [[sala]] = await db.query('SELECT id FROM salas_velacion WHERE id = ?', [sala_id])
    if (!sala) return res.status(404).json({ mensaje: 'Sala no encontrada' })

    // Exclusividad con homenaje en residencia
    const [enRes] = await db.query(
      'SELECT id FROM homenajes_residencia WHERE asistencia_id = ? LIMIT 1',
      [asistencia_id]
    )
    if (enRes.length) {
      return res.status(409).json({
        mensaje: 'Esta asistencia ya tiene un homenaje en residencia registrado. No puede tener también en sala.',
      })
    }

    const [r] = await db.query(
      'INSERT INTO homenajes_sala (asistencia_id, sala_id, observaciones_generales, created_by) VALUES (?,?,?,?)',
      [asistencia_id, sala_id, observaciones_generales || null, usuario]
    )
    const [nueva] = await db.query('SELECT * FROM homenajes_sala WHERE id = ?', [r.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-sala/:id/ingreso
async function guardarIngreso(req, res, next) {
  try {
    const { id } = req.params
    const { rol } = req.user
    const { ingreso_data, observaciones_generales, motivo } = req.body
    if (!ingreso_data) return res.status(400).json({ mensaje: 'ingreso_data requerido' })

    // Chequeo de lock: si el ingreso ya está firmado, solo admin con motivo puede modificar
    const [prev] = await db.query('SELECT ingreso_data FROM homenajes_sala WHERE id = ?', [id])
    if (!prev.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    const yaFirmado = estaFirmado(prev[0].ingreso_data)

    if (yaFirmado) {
      if (rol !== 'admin') {
        return res.status(423).json({
          mensaje: 'El ingreso está firmado y bloqueado. Solo admin puede modificarlo.',
        })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({
          mensaje: 'Debes indicar el motivo para modificar un ingreso firmado.',
        })
      }
      // Snapshot del estado anterior
      await insertarAuditoria(id, 'INGRESO', 'UPDATE', parseJson(prev[0].ingreso_data), motivo.trim(), req)
    }

    const campos = { ingreso_data: JSON.stringify(ingreso_data) }
    if (observaciones_generales !== undefined) campos.observaciones_generales = observaciones_generales

    await db.query('UPDATE homenajes_sala SET ? WHERE id = ?', [campos, id])
    const [rows] = await db.query('SELECT * FROM homenajes_sala WHERE id = ?', [id])

    // Sync gestión de servicios (novenario / última noche en residencia desde ingreso)
    try {
      await syncFromIngreso(rows[0].id, rows[0].asistencia_id, ingreso_data, req.user.usuario, req.user.nombre)
    } catch (e) { console.warn('[sync gestion ingreso]', e.message) }

    res.json({ ok: true, homenaje: rows[0], desbloqueado: yaFirmado })
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-sala/:id/salida
async function guardarSalida(req, res, next) {
  try {
    const { id } = req.params
    const { rol } = req.user
    const { salida_data, finalizar, motivo } = req.body
    if (!salida_data) return res.status(400).json({ mensaje: 'salida_data requerido' })

    const [prev] = await db.query('SELECT salida_data FROM homenajes_sala WHERE id = ?', [id])
    if (!prev.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    const yaFirmado = estaFirmado(prev[0].salida_data)

    if (yaFirmado) {
      if (rol !== 'admin') {
        return res.status(423).json({
          mensaje: 'La salida está firmada y bloqueada. Solo admin puede modificarla.',
        })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({
          mensaje: 'Debes indicar el motivo para modificar una salida firmada.',
        })
      }
      await insertarAuditoria(id, 'SALIDA', 'UPDATE', parseJson(prev[0].salida_data), motivo.trim(), req)
    }

    const nuevoEstado = finalizar ? 'FINALIZADO' : 'SALIDA_REGISTRADA'
    await db.query(
      'UPDATE homenajes_sala SET salida_data = ?, estado = ? WHERE id = ?',
      [JSON.stringify(salida_data), nuevoEstado, id]
    )
    const [rows] = await db.query('SELECT * FROM homenajes_sala WHERE id = ?', [id])

    // Sync gestión de servicios (novenario / última noche en residencia)
    try {
      await syncFromSalida(rows[0].id, rows[0].asistencia_id, salida_data, req.user.usuario, req.user.nombre)
    } catch (e) { console.warn('[sync gestion salida]', e.message) }

    // Finalizar el homenaje da por terminada la velación, así que la
    // asistencia pasa de SALA a APROBACION sin moverla a mano en otra
    // pantalla. Si no estaba en SALA se informa y no se toca.
    const asistencia = finalizar
      ? await avanzarPorEvento(rows[0].asistencia_id, 'APROBACION', {
          usuario: req.user.usuario,
          nombre:  req.user.nombre,
          comentario: 'Homenaje de sala finalizado',
        })
      : null

    res.json({ ok: true, homenaje: rows[0], desbloqueado: yaFirmado, asistencia })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-sala/:id/visitas
async function agregarVisita(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre } = req.user
    const { fecha_visita, hora_visita, vo_bo, validacion_data, servicios_data, observaciones, firma_familiar } = req.body

    if (!fecha_visita) return res.status(400).json({ mensaje: 'fecha_visita requerida' })

    // Verificar existencia del homenaje
    const [[h]] = await db.query('SELECT id FROM homenajes_sala WHERE id = ?', [id])
    if (!h) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })

    // Calcular número de visita (MAX + 1)
    const [[{ maxNum }]] = await db.query(
      'SELECT COALESCE(MAX(numero_visita), 0) AS maxNum FROM homenaje_sala_visitas WHERE homenaje_sala_id = ?',
      [id]
    )
    const numero_visita = maxNum + 1

    const [r] = await db.query(
      `INSERT INTO homenaje_sala_visitas
       (homenaje_sala_id, numero_visita, fecha_visita, hora_visita, vo_bo,
        validacion_data, servicios_data, observaciones, firma_familiar, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id, numero_visita, fecha_visita, hora_visita || null, vo_bo || nombre || usuario,
        validacion_data ? JSON.stringify(validacion_data) : null,
        servicios_data  ? JSON.stringify(servicios_data)  : null,
        observaciones || null,
        firma_familiar || null,
        usuario,
      ]
    )
    const [nueva] = await db.query('SELECT * FROM homenaje_sala_visitas WHERE id = ?', [r.insertId])

    // Sync gestión de servicios adicionales marcados en esta visita +
    // novenario/última noche si vienen embebidos en validacion_data.
    try {
      const [[hs]] = await db.query('SELECT asistencia_id FROM homenajes_sala WHERE id = ?', [id])
      await syncFromVisita(r.insertId, parseInt(id), hs?.asistencia_id || null,
        servicios_data, usuario, nombre, validacion_data)
    } catch (e) { console.warn('[sync gestion visita]', e.message) }

    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// GET /api/h360/homenajes-sala/visitas?fecha_desde=&fecha_hasta=&page=&limit=
async function listarVisitas(req, res, next) {
  try {
    const { fecha_desde, fecha_hasta, page = 1, limit = 50 } = req.query
    const offset = (page - 1) * limit
    const conds = []
    const params = []
    if (fecha_desde) { conds.push('v.fecha_visita >= ?'); params.push(fecha_desde) }
    if (fecha_hasta) { conds.push('v.fecha_visita <= ?'); params.push(fecha_hasta) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT v.id, v.numero_visita, v.fecha_visita, v.hora_visita, v.vo_bo, v.observaciones,
              v.homenaje_sala_id,
              a.codigo AS asistencia_codigo, a.nombre_ser_querido,
              sv.nombre AS sala_nombre, s.nombre AS sede_nombre
       FROM homenaje_sala_visitas v
       JOIN homenajes_sala h ON h.id = v.homenaje_sala_id
       LEFT JOIN asistencias a    ON a.id = h.asistencia_id
       LEFT JOIN salas_velacion sv ON sv.id = h.sala_id
       LEFT JOIN sedes s          ON s.id = sv.sede_id
       ${where}
       ORDER BY v.fecha_visita DESC, v.hora_visita DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM homenaje_sala_visitas v ${where}`, params
    )
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-sala/:id/visitas/:visitaId
async function actualizarVisita(req, res, next) {
  try {
    const { id, visitaId } = req.params
    const { rol } = req.user
    const { fecha_visita, hora_visita, vo_bo, validacion_data, servicios_data, observaciones, firma_familiar, motivo } = req.body

    const [prev] = await db.query(
      'SELECT * FROM homenaje_sala_visitas WHERE id = ? AND homenaje_sala_id = ?',
      [visitaId, id]
    )
    if (!prev.length) return res.status(404).json({ mensaje: 'Visita no encontrada' })

    const yaFirmado = !!(prev[0].firma_familiar && String(prev[0].firma_familiar).trim().length > 20)
    if (yaFirmado) {
      if (rol !== 'admin') {
        return res.status(423).json({ mensaje: 'La visita está firmada y bloqueada. Solo admin puede modificarla.' })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({ mensaje: 'Debes indicar el motivo para modificar una visita firmada.' })
      }
      await insertarAuditoria(id, 'VISITA', 'UPDATE', prev[0], motivo.trim(), req, visitaId)
    }

    const campos = {}
    if (fecha_visita     !== undefined) campos.fecha_visita     = fecha_visita
    if (hora_visita      !== undefined) campos.hora_visita      = hora_visita
    if (vo_bo            !== undefined) campos.vo_bo            = vo_bo
    if (validacion_data  !== undefined) campos.validacion_data  = JSON.stringify(validacion_data)
    if (servicios_data   !== undefined) campos.servicios_data   = JSON.stringify(servicios_data)
    if (observaciones    !== undefined) campos.observaciones    = observaciones
    if (firma_familiar   !== undefined) campos.firma_familiar   = firma_familiar
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE homenaje_sala_visitas SET ? WHERE id = ?', [campos, visitaId])
    const [rows] = await db.query('SELECT * FROM homenaje_sala_visitas WHERE id = ?', [visitaId])

    // Si cambió servicios_data o validacion_data, sincronizar bandeja del coordinador
    if (servicios_data !== undefined || validacion_data !== undefined) {
      try {
        const [[hs]] = await db.query('SELECT asistencia_id FROM homenajes_sala WHERE id = ?', [id])
        // Si vino solo uno, leer el otro de la BD para no perder pendientes
        const servFinal = servicios_data !== undefined ? servicios_data : parseJson(rows[0].servicios_data)
        const validFinal = validacion_data !== undefined ? validacion_data : parseJson(rows[0].validacion_data)
        await syncFromVisita(parseInt(visitaId), parseInt(id), hs?.asistencia_id || null,
          servFinal, req.user.usuario, req.user.nombre, validFinal)
      } catch (e) { console.warn('[sync gestion visita update]', e.message) }
    }

    res.json({ ok: true, visita: rows[0], desbloqueado: yaFirmado })
  } catch (err) { next(err) }
}

// GET /api/h360/homenajes-sala/:id/auditoria
async function obtenerAuditoria(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query(
      `SELECT id, seccion, accion, snapshot_anterior, motivo, usuario_id, nombre_usuario,
              visita_id, created_at
       FROM homenaje_sala_auditoria
       WHERE homenaje_sala_id = ?
       ORDER BY created_at DESC`,
      [id]
    )
    res.json(rows)
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, crear, guardarIngreso, guardarSalida, agregarVisita, listarVisitas, actualizarVisita, obtenerAuditoria }
