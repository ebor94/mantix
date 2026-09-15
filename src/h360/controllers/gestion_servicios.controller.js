/**
 * gestion_servicios.controller.js
 * Bandeja del coordinador operativo. Alimentada por sync_gestion.service.
 */
const db = require('../config/db')

// GET /api/h360/gestion-servicios?estado=PENDIENTE|GESTIONADO|DESCARTADO|all&tipo=&fecha_desde=&fecha_hasta=
async function listar(req, res, next) {
  try {
    const { estado = 'PENDIENTE', tipo, fecha_desde, fecha_hasta } = req.query
    const conds = []
    const params = []

    if (estado && estado !== 'all') { conds.push('g.estado = ?'); params.push(estado) }
    if (tipo)                       { conds.push('g.tipo_servicio = ?'); params.push(tipo) }
    if (fecha_desde)                { conds.push('DATE(g.fecha_ofrecimiento) >= ?'); params.push(fecha_desde) }
    if (fecha_hasta)                { conds.push('DATE(g.fecha_ofrecimiento) <= ?'); params.push(fecha_hasta) }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT g.*,
              a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato,
              a.telefono_contacto, a.nombre_contacto,
              sv.nombre AS sala_nombre, s.nombre AS sede_nombre
       FROM gestion_servicios g
       LEFT JOIN asistencias a       ON a.id = g.asistencia_id
       LEFT JOIN homenajes_sala h    ON h.id = g.homenaje_sala_id
       LEFT JOIN salas_velacion sv   ON sv.id = h.sala_id
       LEFT JOIN sedes s             ON s.id = sv.sede_id
       ${where}
       ORDER BY (g.estado = 'PENDIENTE') DESC, g.fecha_ofrecimiento DESC`,
      params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

// PATCH /api/h360/gestion-servicios/:id
// body: { accion: 'gestionar' | 'descartar' | 'reabrir', notas }
async function actualizar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, nombre, rol } = req.user
    const { accion, notas } = req.body || {}

    const [rows] = await db.query('SELECT * FROM gestion_servicios WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Servicio no encontrado' })
    const g = rows[0]

    let updates = {}
    if (accion === 'gestionar') {
      updates = {
        estado: 'GESTIONADO',
        gestionado_por: usuario,
        gestionado_por_nombre: nombre || null,
        gestionado_at: new Date(),
        notas_gestion: notas || null,
      }
    } else if (accion === 'descartar') {
      if (rol !== 'admin' && rol !== 'coordinador') {
        return res.status(403).json({ mensaje: 'Solo admin/coordinador puede descartar' })
      }
      updates = {
        estado: 'DESCARTADO',
        gestionado_por: usuario,
        gestionado_por_nombre: nombre || null,
        gestionado_at: new Date(),
        notas_gestion: notas || null,
      }
    } else if (accion === 'reabrir') {
      if (rol !== 'admin' && rol !== 'coordinador') {
        return res.status(403).json({ mensaje: 'Solo admin/coordinador puede reabrir' })
      }
      updates = {
        estado: 'PENDIENTE',
        gestionado_por: null,
        gestionado_por_nombre: null,
        gestionado_at: null,
        notas_gestion: null,
      }
    } else {
      return res.status(400).json({ mensaje: 'Acción inválida (gestionar | descartar | reabrir)' })
    }

    await db.query('UPDATE gestion_servicios SET ? WHERE id = ?', [updates, id])
    const [after] = await db.query('SELECT * FROM gestion_servicios WHERE id = ?', [id])
    res.json({ ok: true, servicio: after[0] })
  } catch (err) { next(err) }
}

module.exports = { listar, actualizar }
