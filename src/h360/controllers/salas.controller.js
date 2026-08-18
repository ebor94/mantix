/**
 * salas.controller.js
 * CRUD de salas de velación. Listar público (para dropdowns), CUD sólo admin.
 */
const db = require('../config/db')

// GET /api/h360/salas?sede_id=X&activo=1
async function listar(req, res, next) {
  try {
    const { sede_id, activo } = req.query
    const conds = []
    const params = []
    if (sede_id) { conds.push('sv.sede_id = ?'); params.push(parseInt(sede_id, 10)) }
    if (activo !== undefined) { conds.push('sv.activo = ?'); params.push(activo === '1' || activo === 'true' ? 1 : 0) }
    else { conds.push('sv.activo = 1') }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT sv.id, sv.sede_id, sv.codigo, sv.nombre, sv.capacidad, sv.activo,
              s.codigo AS sede_codigo, s.nombre AS sede_nombre
       FROM salas_velacion sv
       LEFT JOIN sedes s ON s.id = sv.sede_id
       ${where}
       ORDER BY s.nombre, sv.nombre`,
      params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

// POST /api/h360/salas
async function crear(req, res, next) {
  try {
    const { sede_id, codigo, nombre, capacidad } = req.body
    if (!sede_id || !codigo || !nombre) {
      return res.status(400).json({ mensaje: 'sede_id, codigo y nombre son obligatorios' })
    }
    const [r] = await db.query(
      'INSERT INTO salas_velacion (sede_id, codigo, nombre, capacidad) VALUES (?,?,?,?)',
      [sede_id, codigo, nombre, capacidad || null]
    )
    const [nueva] = await db.query('SELECT * FROM salas_velacion WHERE id = ?', [r.insertId])
    res.status(201).json(nueva[0])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una sala con ese código' })
    }
    next(err)
  }
}

// PATCH /api/h360/salas/:id
async function actualizar(req, res, next) {
  try {
    const { id } = req.params
    const { sede_id, codigo, nombre, capacidad, activo } = req.body
    const campos = {}
    if (sede_id  !== undefined) campos.sede_id  = sede_id
    if (codigo   !== undefined) campos.codigo   = codigo
    if (nombre   !== undefined) campos.nombre   = nombre
    if (capacidad!== undefined) campos.capacidad= capacidad
    if (activo   !== undefined) campos.activo   = activo ? 1 : 0
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })

    await db.query('UPDATE salas_velacion SET ? WHERE id = ?', [campos, id])
    const [rows] = await db.query('SELECT * FROM salas_velacion WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Sala no encontrada' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

module.exports = { listar, crear, actualizar }
