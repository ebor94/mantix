/**
 * novedades_externas.controller.js
 * Vista para el rol asistente_tanatologo: novedades de homenajes en residencia
 * asignadas a él para que registre la actividad realizada + firmas.
 */
const db = require('../config/db')

// GET /api/h360/novedades-externas?estado=PENDIENTE|RESUELTA|all
async function listar(req, res, next) {
  try {
    const { usuario, rol } = req.user
    const { estado = 'PENDIENTE', asignado_a } = req.query

    const conds = []
    const params = []

    // No-admin solo ve las suyas; admin puede filtrar con ?asignado_a
    if (rol !== 'admin') {
      conds.push('n.asignado_a = ?')
      params.push(usuario)
    } else if (asignado_a) {
      conds.push('n.asignado_a = ?')
      params.push(asignado_a)
    }

    if (estado && estado !== 'all') {
      conds.push('n.estado = ?')
      params.push(estado)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT n.id, n.homenaje_residencia_id, n.fecha_reporte, n.hora_reporte,
              n.descripcion_novedad, n.asignado_a, n.asignado_a_nombre,
              n.estado, n.resuelto_at, n.actividad_realizada,
              n.hora_llegada, n.hora_retiro, n.asistente_homenajes,
              n.firma_cliente, n.firma_asistente, n.created_by, n.created_at,
              h.asistencia_id, a.codigo AS asistencia_codigo,
              a.nombre_ser_querido, a.contrato, a.telefono_contacto, a.lugar_asistencia
       FROM homenaje_residencia_novedades n
       JOIN homenajes_residencia h ON h.id = n.homenaje_residencia_id
       LEFT JOIN asistencias a ON a.id = h.asistencia_id
       ${where}
       ORDER BY (n.estado = 'PENDIENTE') DESC, n.fecha_reporte DESC, n.hora_reporte DESC`,
      params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

// GET /api/h360/novedades-externas/:novedadId
async function obtener(req, res, next) {
  try {
    const { novedadId } = req.params
    const { usuario, rol } = req.user

    const [rows] = await db.query(
      `SELECT n.*, h.asistencia_id, a.codigo AS asistencia_codigo,
              a.nombre_ser_querido, a.contrato, a.telefono_contacto, a.lugar_asistencia
       FROM homenaje_residencia_novedades n
       JOIN homenajes_residencia h ON h.id = n.homenaje_residencia_id
       LEFT JOIN asistencias a ON a.id = h.asistencia_id
       WHERE n.id = ?`,
      [novedadId]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Novedad no encontrada' })

    // No-admin solo puede ver las asignadas a él
    if (rol !== 'admin' && rol !== 'supervisora' && rows[0].asignado_a !== usuario) {
      return res.status(403).json({ mensaje: 'Esta novedad no está asignada a ti.' })
    }
    res.json(rows[0])
  } catch (err) { next(err) }
}

// PATCH /api/h360/novedades-externas/:novedadId/resolver
async function resolver(req, res, next) {
  try {
    const { novedadId } = req.params
    const { usuario, rol, nombre } = req.user
    const { actividad_realizada, hora_llegada, hora_retiro, firma_cliente, firma_asistente } = req.body

    const [rows] = await db.query('SELECT * FROM homenaje_residencia_novedades WHERE id = ?', [novedadId])
    if (!rows.length) return res.status(404).json({ mensaje: 'Novedad no encontrada' })
    const n = rows[0]

    if (rol !== 'admin' && n.asignado_a !== usuario) {
      return res.status(403).json({ mensaje: 'Esta novedad no está asignada a ti.' })
    }
    if (n.estado === 'RESUELTA') {
      return res.status(400).json({ mensaje: 'Esta novedad ya fue resuelta.' })
    }
    if (!actividad_realizada?.trim()) {
      return res.status(400).json({ mensaje: 'actividad_realizada es obligatoria.' })
    }
    if (!firma_cliente || String(firma_cliente).length < 20) {
      return res.status(400).json({ mensaje: 'Falta la firma del cliente.' })
    }
    if (!firma_asistente || String(firma_asistente).length < 20) {
      return res.status(400).json({ mensaje: 'Falta la firma del asistente.' })
    }

    await db.query(
      `UPDATE homenaje_residencia_novedades SET
        actividad_realizada = ?, hora_llegada = ?, hora_retiro = ?,
        firma_cliente = ?, firma_asistente = ?,
        asistente_homenajes = ?,
        estado = 'RESUELTA', resuelto_at = NOW()
       WHERE id = ?`,
      [actividad_realizada.trim(), hora_llegada || null, hora_retiro || null,
       firma_cliente, firma_asistente, nombre || usuario, novedadId]
    )

    // Auditoría (fire-and-forget)
    try {
      await db.query(
        `INSERT INTO homenaje_residencia_auditoria
         (homenaje_residencia_id, novedad_id, seccion, accion, motivo, usuario_id, nombre_usuario)
         VALUES (?,?,?,?,?,?,?)`,
        [n.homenaje_residencia_id, novedadId, 'NOVEDAD', 'CREATE',
         'Novedad resuelta por asistente asignado', usuario, nombre || null]
      )
    } catch (e) { console.warn('[auditoria novedad]', e.message) }

    const [updated] = await db.query('SELECT * FROM homenaje_residencia_novedades WHERE id = ?', [novedadId])
    res.json({ ok: true, novedad: updated[0] })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, resolver }
