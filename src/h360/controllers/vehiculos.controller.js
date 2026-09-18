const db = require('../config/db')

async function listar(req, res, next) {
  try {
    const filtros = []
    const params  = []
    if (req.query.activo !== undefined) {
      filtros.push('activo = ?')
      params.push(req.query.activo === '1' || req.query.activo === 'true' ? 1 : 0)
    }
    if (req.query.tipo) { filtros.push('tipo = ?'); params.push(req.query.tipo) }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `SELECT * FROM vehiculos ${where} ORDER BY activo DESC, placa`, params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

async function obtener(req, res, next) {
  try {
    const [rows] = await db.query('SELECT * FROM vehiculos WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Vehículo no encontrado' })
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function crear(req, res, next) {
  try {
    const { placa, marca, modelo, anio, tipo, activo, observaciones } = req.body
    if (!placa) return res.status(400).json({ mensaje: 'La placa es requerida' })
    const [dup] = await db.query('SELECT id FROM vehiculos WHERE placa = ?', [placa.trim().toUpperCase()])
    if (dup.length) return res.status(409).json({ mensaje: 'Ya existe un vehículo con esa placa' })
    const [r] = await db.query(
      `INSERT INTO vehiculos (placa, marca, modelo, anio, tipo, activo, observaciones)
       VALUES (?,?,?,?,?,?,?)`,
      [
        placa.trim().toUpperCase(), marca || null, modelo || null,
        anio || null, tipo || 'CARROZA',
        activo === false ? 0 : 1,
        observaciones || null,
      ]
    )
    const [nuevo] = await db.query('SELECT * FROM vehiculos WHERE id = ?', [r.insertId])
    res.status(201).json(nuevo[0])
  } catch (err) { next(err) }
}

async function actualizar(req, res, next) {
  try {
    const { id } = req.params
    const CAMPOS = ['placa', 'marca', 'modelo', 'anio', 'tipo', 'activo', 'observaciones']
    const updates = {}
    for (const k of CAMPOS) if (req.body[k] !== undefined) updates[k] = req.body[k]
    if (updates.placa) updates.placa = String(updates.placa).trim().toUpperCase()
    if (typeof updates.activo === 'boolean') updates.activo = updates.activo ? 1 : 0
    if (!Object.keys(updates).length)
      return res.status(400).json({ mensaje: 'Nada que actualizar' })
    if (updates.placa) {
      const [dup] = await db.query('SELECT id FROM vehiculos WHERE placa = ? AND id <> ?', [updates.placa, id])
      if (dup.length) return res.status(409).json({ mensaje: 'Ya existe otro vehículo con esa placa' })
    }
    await db.query('UPDATE vehiculos SET ? WHERE id = ?', [updates, id])
    const [rows] = await db.query('SELECT * FROM vehiculos WHERE id = ?', [id])
    res.json(rows[0])
  } catch (err) { next(err) }
}

async function eliminar(req, res, next) {
  try {
    const { id } = req.params
    const [uso] = await db.query('SELECT 1 FROM exequias WHERE vehiculo_id = ? LIMIT 1', [id])
    if (uso.length)
      return res.status(409).json({ mensaje: 'El vehículo ya tiene exequias asociadas; inactívalo en lugar de eliminar.' })
    await db.query('DELETE FROM vehiculos WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, crear, actualizar, eliminar }
