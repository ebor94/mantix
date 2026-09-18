const db = require('../config/db')

// ─────────────────────────────────────────────────────────────
// Historial
// ─────────────────────────────────────────────────────────────
async function insertarHistorial(exequiaId, estadoDe, estadoA, usuarioId, nota) {
  await db.query(
    `INSERT INTO exequia_historial (exequia_id, estado_de, estado_a, usuario_id, nota)
     VALUES (?,?,?,?,?)`,
    [exequiaId, estadoDe, estadoA, usuarioId, nota || null]
  )
}

// ─────────────────────────────────────────────────────────────
// Query enriquecida — trae joins comunes
// ─────────────────────────────────────────────────────────────
const SELECT_FULL = `
  SELECT e.*,
         a.codigo             AS asistencia_codigo,
         a.nombre_ser_querido AS ser_querido,
         v.placa              AS vehiculo_placa,
         v.marca              AS vehiculo_marca,
         v.modelo             AS vehiculo_modelo
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
`

// GET /exequias  ?estado=&fecha=&asistencia_id=&fecha_desde=&fecha_hasta=
async function listar(req, res, next) {
  try {
    const filtros = []
    const params  = []
    const { estado, fecha, asistencia_id, fecha_desde, fecha_hasta } = req.query
    if (estado) {
      const estados = String(estado).split(',').map(s => s.trim()).filter(Boolean)
      if (estados.length) {
        filtros.push(`e.estado IN (${estados.map(() => '?').join(',')})`)
        params.push(...estados)
      }
    }
    if (fecha)         { filtros.push('e.fecha = ?');       params.push(fecha) }
    if (asistencia_id) { filtros.push('e.asistencia_id = ?'); params.push(asistencia_id) }
    if (fecha_desde)   { filtros.push('e.fecha >= ?');      params.push(fecha_desde) }
    if (fecha_hasta)   { filtros.push('e.fecha <= ?');      params.push(fecha_hasta) }
    const where = filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''
    const [rows] = await db.query(
      `${SELECT_FULL} ${where} ORDER BY e.fecha DESC, e.hora`, params
    )
    res.json(rows)
  } catch (err) { next(err) }
}

// GET /exequias/:id
async function obtener(req, res, next) {
  try {
    const [rows] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [req.params.id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    const [hist] = await db.query(
      `SELECT * FROM exequia_historial WHERE exequia_id = ? ORDER BY created_at DESC`,
      [req.params.id]
    )
    res.json({ ...rows[0], historial: hist })
  } catch (err) { next(err) }
}

// POST /exequias
async function crear(req, res, next) {
  try {
    const { usuario } = req.user
    const {
      asistencia_id, tipo, fecha, hora,
      lugar, barrio, parroquia, direccion, observaciones,
    } = req.body

    if (!asistencia_id || !tipo || !fecha || !hora || !lugar)
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios: asistencia, tipo, fecha, hora, lugar' })
    if (!['EXEQUIA', 'CEREMONIA'].includes(tipo))
      return res.status(400).json({ mensaje: 'Tipo debe ser EXEQUIA o CEREMONIA' })

    // Verifica que la asistencia exista
    const [a] = await db.query('SELECT id FROM asistencias WHERE id = ?', [asistencia_id])
    if (!a.length) return res.status(400).json({ mensaje: 'Asistencia no existe' })

    const [r] = await db.query(
      `INSERT INTO exequias
       (asistencia_id, tipo, fecha, hora, lugar, barrio, parroquia, direccion, observaciones, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [asistencia_id, tipo, fecha, hora, lugar,
       barrio || null, parroquia || null, direccion || null,
       observaciones || null, usuario]
    )
    await insertarHistorial(r.insertId, null, 'PENDIENTE_CONFIRMAR', usuario, 'Exequia creada')

    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [r.insertId])
    res.status(201).json(nueva[0])
  } catch (err) { next(err) }
}

// PATCH /exequias/:id (solo si PENDIENTE_CONFIRMAR)
async function actualizar(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PENDIENTE_CONFIRMAR' && req.user.rol !== 'admin')
      return res.status(409).json({ mensaje: 'La exequia ya fue confirmada; no se puede editar' })

    const CAMPOS = ['tipo','fecha','hora','lugar','barrio','parroquia','direccion','observaciones']
    const updates = {}
    for (const k of CAMPOS) if (req.body[k] !== undefined) updates[k] = req.body[k]
    if (!Object.keys(updates).length)
      return res.status(400).json({ mensaje: 'Nada que actualizar' })
    await db.query('UPDATE exequias SET ? WHERE id = ?', [updates, id])
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// POST /exequias/:id/confirmar
async function confirmar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { nota } = req.body
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PENDIENTE_CONFIRMAR')
      return res.status(409).json({ mensaje: `Solo se confirman exequias en estado PENDIENTE_CONFIRMAR (actual: ${rows[0].estado})` })

    await db.query(
      `UPDATE exequias
         SET estado='PENDIENTE_VEHICULO', confirmada_por=?, confirmada_at=NOW(), confirmacion_nota=?
       WHERE id=?`,
      [usuario, nota || null, id]
    )
    await insertarHistorial(id, 'PENDIENTE_CONFIRMAR', 'PENDIENTE_VEHICULO', usuario, nota || 'Confirmada')
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// POST /exequias/:id/asignar-vehiculo
async function asignarVehiculo(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { vehiculo_id, conductor_id } = req.body

    if (!vehiculo_id || !conductor_id)
      return res.status(400).json({ mensaje: 'Vehículo y conductor son requeridos' })

    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (!['PENDIENTE_VEHICULO', 'PROGRAMADA'].includes(rows[0].estado))
      return res.status(409).json({ mensaje: `No se puede asignar vehículo en estado ${rows[0].estado}` })

    const [v] = await db.query('SELECT id, activo FROM vehiculos WHERE id = ?', [vehiculo_id])
    if (!v.length) return res.status(400).json({ mensaje: 'Vehículo no existe' })
    if (!v[0].activo) return res.status(400).json({ mensaje: 'Vehículo inactivo' })

    await db.query(
      `UPDATE exequias
         SET estado='PROGRAMADA', vehiculo_id=?, conductor_id=?, asignada_por=?, asignada_at=NOW()
       WHERE id=?`,
      [vehiculo_id, conductor_id, usuario, id]
    )
    await insertarHistorial(id, rows[0].estado, 'PROGRAMADA', usuario, `Vehículo ${vehiculo_id} · Conductor ${conductor_id}`)
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// POST /exequias/:id/marcar-realizada
async function marcarRealizada(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { nota } = req.body
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (rows[0].estado !== 'PROGRAMADA')
      return res.status(409).json({ mensaje: 'Solo se marcan como realizadas exequias PROGRAMADAS' })

    await db.query(`UPDATE exequias SET estado='REALIZADA' WHERE id=?`, [id])
    await insertarHistorial(id, 'PROGRAMADA', 'REALIZADA', usuario, nota || 'Marcada como realizada')
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// POST /exequias/:id/cancelar
async function cancelar(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { motivo } = req.body
    if (!motivo) return res.status(400).json({ mensaje: 'Motivo requerido para cancelar' })
    const [rows] = await db.query('SELECT estado FROM exequias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Exequia no encontrada' })
    if (['REALIZADA', 'CANCELADA'].includes(rows[0].estado))
      return res.status(409).json({ mensaje: `Estado terminal: ${rows[0].estado}` })

    await db.query(`UPDATE exequias SET estado='CANCELADA', cancelada_motivo=? WHERE id=?`, [motivo, id])
    await insertarHistorial(id, rows[0].estado, 'CANCELADA', usuario, motivo)
    const [nueva] = await db.query(`${SELECT_FULL} WHERE e.id = ?`, [id])
    res.json(nueva[0])
  } catch (err) { next(err) }
}

// GET /publico/programacion/:token — sin auth
async function programacionPublica(req, res, next) {
  try {
    const { token } = req.params
    const esperado = process.env.PROGRAMACION_PUBLIC_TOKEN
    if (!esperado) return res.status(500).json({ mensaje: 'Servicio no configurado' })
    if (!token || token !== esperado) return res.status(404).json({ mensaje: 'No encontrado' })

    // Exequias del día actual en estado PROGRAMADA o REALIZADA, ordenadas por hora
    const [rows] = await db.query(`
      SELECT e.id, e.tipo, e.hora, e.lugar, e.barrio, e.parroquia, e.direccion,
             e.estado, e.conductor_id, v.placa AS vehiculo_placa,
             a.nombre_ser_querido AS ser_querido
        FROM exequias e
        JOIN asistencias a ON a.id = e.asistencia_id
   LEFT JOIN vehiculos  v ON v.id = e.vehiculo_id
       WHERE e.fecha = CURDATE()
         AND e.estado IN ('PROGRAMADA','REALIZADA')
    ORDER BY e.hora ASC
    `)
    res.json({
      ok: true,
      generado_at: new Date().toISOString(),
      count: rows.length,
      items: rows,
    })
  } catch (err) { next(err) }
}

module.exports = {
  listar, obtener, crear, actualizar,
  confirmar, asignarVehiculo, marcarRealizada, cancelar,
  programacionPublica,
}
