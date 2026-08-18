/**
 * sedes.controller.js
 * Solo lectura del catálogo de sedes (compartido con Mantix).
 */
const db = require('../config/db')

// GET /api/h360/sedes
async function listar(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT id, codigo, nombre, ciudad FROM sedes WHERE activo = 1 ORDER BY nombre'
    )
    res.json(rows)
  } catch (err) { next(err) }
}

module.exports = { listar }
