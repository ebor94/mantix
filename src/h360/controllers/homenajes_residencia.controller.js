/**
 * homenajes_residencia.controller.js
 * Formato R-29: seguimiento a homenajes en residencia.
 *
 * Reglas:
 *  - Excluyente con homenaje en sala: una asistencia solo puede tener uno u otro.
 *  - Novedades con firma_cliente o firma_asistente → bloqueadas. Admin edita con motivo.
 *  - Auditoría en homenaje_residencia_auditoria (snapshot + motivo).
 */
const db = require('../config/db')

function parseJson(v) {
  if (!v) return null
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v
}

function novedadFirmada(row) {
  const fc = row?.firma_cliente
  const fa = row?.firma_asistente
  return !!((fc && String(fc).length > 20) || (fa && String(fa).length > 20))
}

async function insertarAuditoria(homenaje_residencia_id, seccion, accion, snapshot, motivo, req, novedad_id = null) {
  const { usuario, nombre } = req.user || {}
  await db.query(
    `INSERT INTO homenaje_residencia_auditoria
     (homenaje_residencia_id, novedad_id, seccion, accion, snapshot_anterior, motivo, usuario_id, nombre_usuario)
     VALUES (?,?,?,?,?,?,?,?)`,
    [homenaje_residencia_id, novedad_id, seccion, accion,
     snapshot ? JSON.stringify(snapshot) : null,
     motivo || null, usuario, nombre || null]
  )
}

// GET /api/h360/homenajes-residencia?asistencia_id=X&estado=X&page&limit
async function listar(req, res, next) {
  try {
    const { asistencia_id, estado, page = 1, limit = 50 } = req.query
    const conds = []
    const params = []
    if (asistencia_id) { conds.push('h.asistencia_id = ?'); params.push(parseInt(asistencia_id, 10)) }
    if (estado)        { conds.push('h.estado = ?');        params.push(estado) }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const offset = (page - 1) * limit

    const [rows] = await db.query(
      `SELECT h.*, a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato
       FROM homenajes_residencia h
       LEFT JOIN asistencias a ON a.id = h.asistencia_id
       ${where}
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    )
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM homenajes_residencia h ${where}`,
      params
    )
    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
}

// GET /api/h360/homenajes-residencia/:id
async function obtener(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query(
      `SELECT h.*, a.codigo AS asistencia_codigo, a.nombre_ser_querido, a.contrato,
              a.nombre_contacto, a.telefono_contacto, a.lugar_asistencia
       FROM homenajes_residencia h
       LEFT JOIN asistencias a ON a.id = h.asistencia_id
       WHERE h.id = ?`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Homenaje en residencia no encontrado' })

    const [novedades] = await db.query(
      'SELECT * FROM homenaje_residencia_novedades WHERE homenaje_residencia_id = ? ORDER BY fecha_reporte DESC, hora_reporte DESC',
      [id]
    )
    res.json({ ...rows[0], novedades })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-residencia
async function crear(req, res, next) {
  try {
    const { asistencia_id, observaciones_generales } = req.body
    const { usuario } = req.user
    if (!asistencia_id) return res.status(400).json({ mensaje: 'asistencia_id requerido' })

    // Exclusividad: no puede existir homenaje en sala para esta asistencia
    const [enSala] = await db.query(
      'SELECT id FROM homenajes_sala WHERE asistencia_id = ? LIMIT 1',
      [asistencia_id]
    )
    if (enSala.length) {
      return res.status(409).json({
        mensaje: 'Esta asistencia ya tiene un homenaje en sala registrado. No puede tener también en residencia.',
      })
    }
    // Y tampoco puede existir otro en residencia
    const [enRes] = await db.query(
      'SELECT id FROM homenajes_residencia WHERE asistencia_id = ? LIMIT 1',
      [asistencia_id]
    )
    if (enRes.length) {
      return res.status(409).json({
        mensaje: 'Esta asistencia ya tiene un homenaje en residencia registrado.',
      })
    }

    const [r] = await db.query(
      'INSERT INTO homenajes_residencia (asistencia_id, observaciones_generales, created_by) VALUES (?,?,?)',
      [asistencia_id, observaciones_generales || null, usuario]
    )
    const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [r.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-residencia/:id/primera-llamada
async function guardarPrimeraLlamada(req, res, next) {
  try {
    const { id } = req.params
    const { primera_llamada_data } = req.body
    if (!primera_llamada_data) return res.status(400).json({ mensaje: 'primera_llamada_data requerido' })
    const [ok] = await db.query('SELECT id FROM homenajes_residencia WHERE id = ?', [id])
    if (!ok.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    await db.query('UPDATE homenajes_residencia SET primera_llamada_data = ? WHERE id = ?',
      [JSON.stringify(primera_llamada_data), id])
    const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
    res.json({ ok: true, homenaje: rows[0] })
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-residencia/:id/segunda-llamada
async function guardarSegundaLlamada(req, res, next) {
  try {
    const { id } = req.params
    const { segunda_llamada_data } = req.body
    if (!segunda_llamada_data) return res.status(400).json({ mensaje: 'segunda_llamada_data requerido' })
    const [ok] = await db.query('SELECT id FROM homenajes_residencia WHERE id = ?', [id])
    if (!ok.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    await db.query('UPDATE homenajes_residencia SET segunda_llamada_data = ? WHERE id = ?',
      [JSON.stringify(segunda_llamada_data), id])
    const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
    res.json({ ok: true, homenaje: rows[0] })
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-residencia/:id/equipo-velacion
async function guardarEquipoVelacion(req, res, next) {
  try {
    const { id } = req.params
    const { equipo_velacion_data, finalizar } = req.body
    if (!equipo_velacion_data) return res.status(400).json({ mensaje: 'equipo_velacion_data requerido' })
    const [ok] = await db.query('SELECT id FROM homenajes_residencia WHERE id = ?', [id])
    if (!ok.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })
    const nuevoEstado = finalizar ? 'COMPLETADO' : undefined
    if (nuevoEstado) {
      await db.query('UPDATE homenajes_residencia SET equipo_velacion_data = ?, estado = ? WHERE id = ?',
        [JSON.stringify(equipo_velacion_data), nuevoEstado, id])
    } else {
      await db.query('UPDATE homenajes_residencia SET equipo_velacion_data = ? WHERE id = ?',
        [JSON.stringify(equipo_velacion_data), id])
    }
    const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
    res.json({ ok: true, homenaje: rows[0] })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-residencia/:id/novedades
async function agregarNovedad(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { fecha_reporte, hora_reporte, asistente_homenajes, hora_llegada, hora_retiro,
            actividad_realizada, firma_cliente, firma_asistente } = req.body
    if (!fecha_reporte) return res.status(400).json({ mensaje: 'fecha_reporte requerido' })
    const [ok] = await db.query('SELECT id FROM homenajes_residencia WHERE id = ?', [id])
    if (!ok.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })

    const [r] = await db.query(
      `INSERT INTO homenaje_residencia_novedades
       (homenaje_residencia_id, fecha_reporte, hora_reporte, asistente_homenajes,
        hora_llegada, hora_retiro, actividad_realizada, firma_cliente, firma_asistente, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, fecha_reporte, hora_reporte || null, asistente_homenajes || null,
       hora_llegada || null, hora_retiro || null, actividad_realizada || null,
       firma_cliente || null, firma_asistente || null, usuario]
    )
    const [rows] = await db.query('SELECT * FROM homenaje_residencia_novedades WHERE id = ?', [r.insertId])
    res.status(201).json(rows[0])
  } catch (err) { next(err) }
}

// PATCH /api/h360/homenajes-residencia/:id/novedades/:novedadId
async function actualizarNovedad(req, res, next) {
  try {
    const { id, novedadId } = req.params
    const { rol } = req.user
    const { motivo, ...cambios } = req.body

    const [prev] = await db.query(
      'SELECT * FROM homenaje_residencia_novedades WHERE id = ? AND homenaje_residencia_id = ?',
      [novedadId, id]
    )
    if (!prev.length) return res.status(404).json({ mensaje: 'Novedad no encontrada' })

    const yaFirmada = novedadFirmada(prev[0])
    if (yaFirmada) {
      if (rol !== 'admin') {
        return res.status(423).json({ mensaje: 'La novedad está firmada y bloqueada. Solo admin puede modificarla.' })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({ mensaje: 'Debes indicar el motivo para modificar una novedad firmada.' })
      }
      await insertarAuditoria(id, 'NOVEDAD', 'UPDATE', prev[0], motivo.trim(), req, novedadId)
    }

    const campos = {}
    for (const k of ['fecha_reporte','hora_reporte','asistente_homenajes','hora_llegada','hora_retiro',
                     'actividad_realizada','firma_cliente','firma_asistente']) {
      if (cambios[k] !== undefined) campos[k] = cambios[k]
    }
    if (!Object.keys(campos).length) return res.status(400).json({ mensaje: 'Nada que actualizar' })
    await db.query('UPDATE homenaje_residencia_novedades SET ? WHERE id = ?', [campos, novedadId])
    const [rows] = await db.query('SELECT * FROM homenaje_residencia_novedades WHERE id = ?', [novedadId])
    res.json({ ok: true, novedad: rows[0], desbloqueado: yaFirmada })
  } catch (err) { next(err) }
}

// GET /api/h360/homenajes-residencia/:id/auditoria
async function obtenerAuditoria(req, res, next) {
  try {
    const { id } = req.params
    const [rows] = await db.query(
      `SELECT id, seccion, accion, snapshot_anterior, motivo, usuario_id, nombre_usuario,
              novedad_id, created_at
       FROM homenaje_residencia_auditoria
       WHERE homenaje_residencia_id = ?
       ORDER BY created_at DESC`,
      [id]
    )
    res.json(rows)
  } catch (err) { next(err) }
}

module.exports = {
  listar, obtener, crear,
  guardarPrimeraLlamada, guardarSegundaLlamada, guardarEquipoVelacion,
  agregarNovedad, actualizarNovedad, obtenerAuditoria,
}
