/**
 * cofres.controller.js
 * Consulta de uso histórico de cofres. Sin CRUD por ahora — solo lectura para
 * futuras integraciones del módulo completo de reutilización.
 */
const db = require('../config/db')

// GET /api/h360/cofres/:consecutivo/usos
async function obtenerUsos(req, res, next) {
  try {
    const { consecutivo } = req.params
    const [cofres] = await db.query('SELECT * FROM cofres WHERE consecutivo = ?', [consecutivo])
    if (!cofres.length) return res.status(404).json({ mensaje: 'Cofre no encontrado' })

    const cofre = cofres[0]
    const [usos] = await db.query(
      `SELECT u.*, a.codigo AS asistencia_codigo, a.nombre_ser_querido
       FROM cofre_usos u
       LEFT JOIN asistencias a ON a.id = u.asistencia_id
       WHERE u.cofre_id = ?
       ORDER BY u.fecha_uso DESC`,
      [cofre.id]
    )

    res.json({ cofre, usos })
  } catch (err) { next(err) }
}

// GET /api/h360/cofres — listado global (para consultas futuras)
async function listar(req, res, next) {
  try {
    const { tipo, page = 1, limit = 50 } = req.query
    const offset = (page - 1) * limit

    const conds = []
    const params = []
    if (tipo) { conds.push('ultimo_tipo = ?'); params.push(tipo) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT * FROM cofres ${where} ORDER BY ultimo_uso_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM cofres ${where}`, params)

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
}

module.exports = { obtenerUsos, listar }
