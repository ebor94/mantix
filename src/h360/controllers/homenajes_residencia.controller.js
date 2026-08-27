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
const { sendOTP } = require('../../services/whatsappService')

// TTL del token en minutos
const TOKEN_TTL_MIN = 10

function generarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000))  // 6 dígitos
}

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
    // Tokens de las 3 secciones (sin exponer el código, solo estado y metadatos)
    const [tokens] = await db.query(
      `SELECT id, seccion, telefono, estado, verificado_at, expira_at, omitido_motivo,
              usuario_solicita, usuario_verifica, created_at
       FROM homenaje_residencia_tokens
       WHERE homenaje_residencia_id = ?
       ORDER BY created_at DESC`,
      [id]
    )
    res.json({ ...rows[0], novedades, tokens })
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

// ── Helper: ¿está la 1a llamada confirmada (token verificado/omitido)? ──
async function primeraLlamadaConfirmada(id) {
  const [prev] = await db.query('SELECT primera_llamada_data FROM homenajes_residencia WHERE id = ?', [id])
  if (!prev.length) return { confirmada: false, prev: null }
  const d = parseJson(prev[0].primera_llamada_data)
  if (!d?.token_id) return { confirmada: false, prev: prev[0], data: d }
  const [tks] = await db.query('SELECT estado FROM homenaje_residencia_tokens WHERE id = ?', [d.token_id])
  const confirmada = tks.length && (tks[0].estado === 'VERIFICADO' || tks[0].estado === 'OMITIDO_ADMIN')
  return { confirmada, prev: prev[0], data: d }
}

// PATCH /api/h360/homenajes-residencia/:id/primera-llamada
async function guardarPrimeraLlamada(req, res, next) {
  try {
    const { id } = req.params
    const { rol } = req.user
    const { primera_llamada_data, token_id, motivo } = req.body
    if (!primera_llamada_data) return res.status(400).json({ mensaje: 'primera_llamada_data requerido' })
    const { confirmada, prev, data: dataPrev } = await primeraLlamadaConfirmada(id)
    if (!prev) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })

    // ── Caso 1: ya está confirmada → bloqueada, solo admin con motivo puede reeditar
    if (confirmada) {
      if (rol !== 'admin') {
        return res.status(423).json({
          mensaje: 'La primera llamada ya fue confirmada y está bloqueada. Solo admin puede modificarla.',
        })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({
          mensaje: 'Debes indicar el motivo para modificar una primera llamada confirmada.',
        })
      }
      // Snapshot del estado anterior en auditoría
      await insertarAuditoria(id, 'PRIMERA_LLAMADA', 'UPDATE', dataPrev, motivo.trim(), req)

      // Conservar token_id original (no se pierde la evidencia)
      const dataAdmin = { ...primera_llamada_data, token_id: dataPrev?.token_id || null }
      await db.query('UPDATE homenajes_residencia SET primera_llamada_data = ? WHERE id = ?',
        [JSON.stringify(dataAdmin), id])
      const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
      return res.json({ ok: true, homenaje: rows[0], desbloqueado: true })
    }

    // ── Caso 2: primer guardado (o borrador) → requiere token verificado
    if (rol !== 'admin') {
      if (!token_id) {
        return res.status(400).json({
          mensaje: 'Debes enviar y verificar el token de confirmación al familiar antes de guardar.',
        })
      }
      const [tks] = await db.query(
        `SELECT estado FROM homenaje_residencia_tokens
         WHERE id = ? AND homenaje_residencia_id = ? AND seccion = 'PRIMERA_LLAMADA'`,
        [token_id, id]
      )
      if (!tks.length) {
        return res.status(400).json({ mensaje: 'Token no encontrado para esta llamada.' })
      }
      if (tks[0].estado !== 'VERIFICADO' && tks[0].estado !== 'OMITIDO_ADMIN') {
        return res.status(400).json({
          mensaje: `El token está en estado ${tks[0].estado}. Debe estar VERIFICADO u OMITIDO_ADMIN.`,
        })
      }
    }

    const dataConToken = { ...primera_llamada_data, token_id: token_id || null }
    await db.query('UPDATE homenajes_residencia SET primera_llamada_data = ? WHERE id = ?',
      [JSON.stringify(dataConToken), id])

    // Registrar CREATE en auditoría (evento de creación/confirmación)
    await insertarAuditoria(id, 'PRIMERA_LLAMADA', 'CREATE', null,
      token_id ? `Confirmada con token #${token_id}` : 'Guardada por admin sin token', req)

    const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
    res.json({ ok: true, homenaje: rows[0] })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-residencia/:id/tokens
async function solicitarToken(req, res, next) {
  try {
    const { id } = req.params
    const { usuario } = req.user
    const { seccion = 'PRIMERA_LLAMADA', telefono } = req.body
    if (!telefono) return res.status(400).json({ mensaje: 'telefono requerido' })
    if (!['PRIMERA_LLAMADA','SEGUNDA_LLAMADA','EQUIPO_VELACION'].includes(seccion)) {
      return res.status(400).json({ mensaje: 'seccion inválida' })
    }

    const [ok] = await db.query('SELECT id FROM homenajes_residencia WHERE id = ?', [id])
    if (!ok.length) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })

    const codigo = generarCodigo()
    const expira = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000)

    // Insertar primero para tener el ID; el envío WhatsApp es fire-and-continue
    const [r] = await db.query(
      `INSERT INTO homenaje_residencia_tokens
       (homenaje_residencia_id, seccion, telefono, token, expira_at, usuario_solicita)
       VALUES (?,?,?,?,?,?)`,
      [id, seccion, telefono, codigo, expira, usuario]
    )
    const tokenId = r.insertId

    // Enviar por WhatsApp con la plantilla toke_acceso
    try {
      const resp = await sendOTP(telefono, codigo, `Homenaje ${id}`)
      await db.query('UPDATE homenaje_residencia_tokens SET respuesta_whatsapp = ? WHERE id = ?',
        [JSON.stringify({ ok: true, provider: resp?.data || resp }), tokenId])
    } catch (waErr) {
      await db.query('UPDATE homenaje_residencia_tokens SET respuesta_whatsapp = ? WHERE id = ?',
        [JSON.stringify({ ok: false, error: waErr.message }), tokenId])
      return res.status(502).json({
        mensaje: 'No se pudo enviar el token por WhatsApp: ' + waErr.message,
        token_id: tokenId,
      })
    }

    res.status(201).json({
      ok: true,
      token_id: tokenId,
      telefono,
      expira_at: expira.toISOString(),
      ttl_minutos: TOKEN_TTL_MIN,
    })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-residencia/:id/tokens/:tokenId/verificar
async function verificarToken(req, res, next) {
  try {
    const { id, tokenId } = req.params
    const { usuario } = req.user
    const { codigo } = req.body
    if (!codigo) return res.status(400).json({ mensaje: 'codigo requerido' })

    const [rows] = await db.query(
      `SELECT * FROM homenaje_residencia_tokens
       WHERE id = ? AND homenaje_residencia_id = ?`,
      [tokenId, id]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Token no encontrado' })
    const t = rows[0]

    if (t.estado === 'VERIFICADO')     return res.status(400).json({ mensaje: 'Este token ya fue verificado.' })
    if (t.estado === 'OMITIDO_ADMIN')  return res.status(400).json({ mensaje: 'Este token fue omitido por admin.' })

    if (t.expira_at && new Date(t.expira_at) < new Date()) {
      await db.query("UPDATE homenaje_residencia_tokens SET estado='EXPIRADO' WHERE id = ?", [tokenId])
      return res.status(410).json({ mensaje: 'El token ha expirado. Solicita uno nuevo.' })
    }

    if (String(codigo).trim() !== String(t.token).trim()) {
      return res.status(400).json({ mensaje: 'Código incorrecto.' })
    }

    await db.query(
      "UPDATE homenaje_residencia_tokens SET estado='VERIFICADO', verificado_at=NOW(), usuario_verifica=? WHERE id = ?",
      [usuario, tokenId]
    )
    res.json({ ok: true, verificado_at: new Date().toISOString() })
  } catch (err) { next(err) }
}

// POST /api/h360/homenajes-residencia/:id/tokens/:tokenId/omitir
async function omitirToken(req, res, next) {
  try {
    const { id, tokenId } = req.params
    const { rol, usuario } = req.user
    const { motivo } = req.body
    if (rol !== 'admin') return res.status(403).json({ mensaje: 'Solo admin puede omitir un token.' })
    if (!motivo?.trim()) return res.status(400).json({ mensaje: 'motivo obligatorio para omitir el token.' })

    const [rows] = await db.query(
      'SELECT estado FROM homenaje_residencia_tokens WHERE id = ? AND homenaje_residencia_id = ?',
      [tokenId, id]
    )
    if (!rows.length) return res.status(404).json({ mensaje: 'Token no encontrado' })
    if (rows[0].estado === 'VERIFICADO') return res.status(400).json({ mensaje: 'Este token ya fue verificado; no requiere omisión.' })

    await db.query(
      "UPDATE homenaje_residencia_tokens SET estado='OMITIDO_ADMIN', omitido_motivo=?, usuario_verifica=? WHERE id = ?",
      [motivo.trim(), usuario, tokenId]
    )
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ── Helper: ¿está la 2a llamada confirmada (token verificado/omitido)? ──
async function segundaLlamadaConfirmada(id) {
  const [prev] = await db.query('SELECT segunda_llamada_data FROM homenajes_residencia WHERE id = ?', [id])
  if (!prev.length) return { confirmada: false, prev: null }
  const d = parseJson(prev[0].segunda_llamada_data)
  if (!d?.token_id) return { confirmada: false, prev: prev[0], data: d }
  const [tks] = await db.query('SELECT estado FROM homenaje_residencia_tokens WHERE id = ?', [d.token_id])
  const confirmada = tks.length && (tks[0].estado === 'VERIFICADO' || tks[0].estado === 'OMITIDO_ADMIN')
  return { confirmada, prev: prev[0], data: d }
}

// PATCH /api/h360/homenajes-residencia/:id/segunda-llamada
async function guardarSegundaLlamada(req, res, next) {
  try {
    const { id } = req.params
    const { rol } = req.user
    const { segunda_llamada_data, token_id, motivo } = req.body
    if (!segunda_llamada_data) return res.status(400).json({ mensaje: 'segunda_llamada_data requerido' })
    const { confirmada, prev, data: dataPrev } = await segundaLlamadaConfirmada(id)
    if (!prev) return res.status(404).json({ mensaje: 'Homenaje no encontrado' })

    // ── Ya confirmada → bloqueada, solo admin con motivo
    if (confirmada) {
      if (rol !== 'admin') {
        return res.status(423).json({
          mensaje: 'La segunda llamada ya fue confirmada y está bloqueada. Solo admin puede modificarla.',
        })
      }
      if (!motivo?.trim()) {
        return res.status(400).json({
          mensaje: 'Debes indicar el motivo para modificar una segunda llamada confirmada.',
        })
      }
      await insertarAuditoria(id, 'SEGUNDA_LLAMADA', 'UPDATE', dataPrev, motivo.trim(), req)

      const dataAdmin = { ...segunda_llamada_data, token_id: dataPrev?.token_id || null }
      await db.query('UPDATE homenajes_residencia SET segunda_llamada_data = ? WHERE id = ?',
        [JSON.stringify(dataAdmin), id])
      const [rows] = await db.query('SELECT * FROM homenajes_residencia WHERE id = ?', [id])
      return res.json({ ok: true, homenaje: rows[0], desbloqueado: true })
    }

    // ── Primer guardado → requiere token verificado (salvo admin)
    if (rol !== 'admin') {
      if (!token_id) {
        return res.status(400).json({
          mensaje: 'Debes enviar y verificar el token de confirmación al familiar antes de guardar.',
        })
      }
      const [tks] = await db.query(
        `SELECT estado FROM homenaje_residencia_tokens
         WHERE id = ? AND homenaje_residencia_id = ? AND seccion = 'SEGUNDA_LLAMADA'`,
        [token_id, id]
      )
      if (!tks.length) {
        return res.status(400).json({ mensaje: 'Token no encontrado para esta llamada.' })
      }
      if (tks[0].estado !== 'VERIFICADO' && tks[0].estado !== 'OMITIDO_ADMIN') {
        return res.status(400).json({
          mensaje: `El token está en estado ${tks[0].estado}. Debe estar VERIFICADO u OMITIDO_ADMIN.`,
        })
      }
    }

    const dataConToken = { ...segunda_llamada_data, token_id: token_id || null }
    await db.query('UPDATE homenajes_residencia SET segunda_llamada_data = ? WHERE id = ?',
      [JSON.stringify(dataConToken), id])

    await insertarAuditoria(id, 'SEGUNDA_LLAMADA', 'CREATE', null,
      token_id ? `Confirmada con token #${token_id}` : 'Guardada por admin sin token', req)

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
  solicitarToken, verificarToken, omitirToken,
}
