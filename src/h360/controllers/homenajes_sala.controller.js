/**
 * homenajes_sala.controller.js
 * Gestión de homenajes en sala (ingreso, visitas, salida) — formato R-22.
 */
const db = require('../config/db')

// GET /api/h360/homenajes-sala?asistencia_id=&sala_id=&estado=&page=&limit=
async function listar(req, res, next) {
  try {
    const { asistencia_id, sala_id, estado, page = 1, limit = 20 } = req.query
    const offset = (page - 1) * limit
    const conds = []
    const params = []
    if (asistencia_id) { conds.push('h.asistencia_id = ?'); params.push(asistencia_id) }
    if (sala_id)       { conds.push('h.sala_id = ?');       params.push(sala_id) }
    if (estado)        { conds.push('h.estado = ?');        params.push(estado) }
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
    const { ingreso_data, observaciones_generales } = req.body
    if (!ingreso_data) return res.status(400).json({ mensaje: 'ingreso_data requerido' })

    const campos = { ingreso_data: JSON.stringify(ingreso_data) }
    if (observaciones_generales !== undefined) campos.observaciones_generales = observaciones_generales

    await db.query('UPDATE homenajes_sala SET ? WHERE id = ?', [campos, id])
    const [rows] = await db.query('SELECT * FROM homenajes_sala WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    res.json({ ok: true, homenaje: rows[0] })
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-sala/:id/salida
async function guardarSalida(req, res, next) {
  try {
    const { id } = req.params
    const { salida_data, finalizar } = req.body
    if (!salida_data) return res.status(400).json({ mensaje: 'salida_data requerido' })

    const nuevoEstado = finalizar ? 'FINALIZADO' : 'SALIDA_REGISTRADA'
    await db.query(
      'UPDATE homenajes_sala SET salida_data = ?, estado = ? WHERE id = ?',
      [JSON.stringify(salida_data), nuevoEstado, id]
    )
    const [rows] = await db.query('SELECT * FROM homenajes_sala WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    res.json({ ok: true, homenaje: rows[0] })
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

module.exports = { listar, obtener, crear, guardarIngreso, guardarSalida, agregarVisita, listarVisitas }
