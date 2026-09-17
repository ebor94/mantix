/**
 * reapertura.controller.js
 * Solicitud + validación de token para reabrir una sección (F-01..F-07)
 * de una asistencia. Token de 6 dígitos, TTL 30 min, un solo uso.
 */
const db = require('../config/db')
const gchat = require('../services/googleChat.service')

const ETAPAS_VALIDAS = ['F01','F02','F03','F04','F05','F06','F07']
const ETAPA_LABEL = {
  F01: 'F-01 Información de la solicitud',
  F02: 'F-02 Inventario recibido',
  F03: 'F-03 Inventario retoque',
  F04: 'F-04 Tanatopraxia',
  F05: 'F-05 Encuentro',
  F06: 'F-06 Encofrado',
  F07: 'F-07 Salida no conforme',
}
const TTL_MINUTOS = 30

function genCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

// POST /api/h360/asistencias/:id/reapertura/solicitar
// body: { etapa, motivo }
async function solicitar(req, res, next) {
  try {
    const { id } = req.params
    const { etapa, motivo } = req.body || {}
    const { usuario, nombre } = req.user

    if (!ETAPAS_VALIDAS.includes(etapa))
      return res.status(400).json({ mensaje: `Etapa inválida (${ETAPAS_VALIDAS.join(', ')})` })
    if (!motivo?.trim() || motivo.trim().length < 8)
      return res.status(400).json({ mensaje: 'El motivo debe tener al menos 8 caracteres.' })

    const [rows] = await db.query('SELECT id, codigo, nombre_ser_querido FROM asistencias WHERE id = ?', [id])
    if (!rows.length) return res.status(404).json({ mensaje: 'Asistencia no encontrada' })
    const a = rows[0]

    // Marca como CANCELADO cualquier token previo ENVIADO para la misma etapa/asistencia
    await db.query(
      `UPDATE reapertura_tokens SET estado='CANCELADO'
       WHERE asistencia_id = ? AND etapa = ? AND estado = 'ENVIADO'`,
      [id, etapa]
    )

    const codigo = genCodigo()
    const expiraAt = new Date(Date.now() + TTL_MINUTOS * 60 * 1000)

    const [ins] = await db.query(
      `INSERT INTO reapertura_tokens
       (asistencia_id, etapa, codigo, motivo, solicitado_por, solicitado_por_nombre, expira_at)
       VALUES (?,?,?,?,?,?,?)`,
      [id, etapa, codigo, motivo.trim(), usuario, nombre || null, expiraAt]
    )

    // Mensaje al aprobador
    const texto =
`🔓 *Solicitud de reapertura de sección*

El usuario *${nombre || usuario}* solicita apertura de la sección *${ETAPA_LABEL[etapa] || etapa}* de la asistencia *${a.codigo}* (${a.nombre_ser_querido || 's/n'}) por motivos de: _${motivo.trim()}_

El token de autorización es: *${codigo}*
Vence: ${expiraAt.toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Bogotá).`

    const envio = await gchat.enviar(texto)
    if (!envio.ok) console.warn('[reapertura] webhook falló:', envio)

    res.json({
      ok: true,
      solicitud_id: ins.insertId,
      expira_at: expiraAt.toISOString(),
      mensaje: envio.ok
        ? 'Solicitud enviada al aprobador. Ingresa el token que te compartirá.'
        : 'Solicitud registrada, pero el webhook falló. Contacta al administrador.',
    })
  } catch (err) { next(err) }
}

// POST /api/h360/asistencias/:id/reapertura/validar
// body: { etapa, codigo }
// Efecto: si es válido, marca etapa como completado=0 (para F02..F07) y token como USADO.
// F-01 no tiene registro en asistencia_etapas — el frontend usa el estado del token para permitir edición.
async function validar(req, res, next) {
  try {
    const { id } = req.params
    const { etapa, codigo } = req.body || {}
    const { usuario } = req.user

    if (!ETAPAS_VALIDAS.includes(etapa))
      return res.status(400).json({ mensaje: 'Etapa inválida' })
    if (!codigo || !/^\d{6}$/.test(String(codigo).trim()))
      return res.status(400).json({ mensaje: 'El código debe ser de 6 dígitos.' })

    const [rows] = await db.query(
      `SELECT * FROM reapertura_tokens
       WHERE asistencia_id = ? AND etapa = ? AND codigo = ? AND estado = 'ENVIADO'
       ORDER BY id DESC LIMIT 1`,
      [id, etapa, String(codigo).trim()]
    )
    if (!rows.length) return res.status(400).json({ mensaje: 'Código inválido o ya utilizado.' })
    const t = rows[0]

    if (new Date(t.expira_at).getTime() < Date.now()) {
      await db.query(`UPDATE reapertura_tokens SET estado='EXPIRADO' WHERE id = ?`, [t.id])
      return res.status(400).json({ mensaje: 'El código ha expirado. Solicita uno nuevo.' })
    }

    // Marcar token USADO
    await db.query(
      `UPDATE reapertura_tokens SET estado='USADO', usado_por=?, usado_at=NOW() WHERE id = ?`,
      [usuario, t.id]
    )

    // Bajar completado=0 de la etapa (F02..F07). F-01 no está en asistencia_etapas.
    if (etapa !== 'F01') {
      const etapaFull = {
        F02: 'F02_INVENTARIO_CUERPO',
        F03: 'F03_INVENTARIO_RETOQUE',
        F04: 'F04_TANATOPRAXIA',
        F05: 'F05_ENTREGA',
        F06: 'F06_ENCOFRADO',
        F07: 'F07_SALIDA_NO_CONFORME',
      }[etapa]
      await db.query(
        `UPDATE asistencia_etapas SET completado = 0
         WHERE asistencia_id = ? AND etapa = ?`,
        [id, etapaFull]
      )
    }

    // Historial (para que el coordinador vea la reapertura)
    try {
      await db.query(
        `INSERT INTO asistencia_historial
          (asistencia_id, estado_desde, estado_hasta, usuario_id, nombre_usuario, comentario)
         VALUES (?, NULL, NULL, ?, ?, ?)`,
        [id, usuario, req.user.nombre || null,
         `REAPERTURA ${etapa}: ${t.motivo} (autorizado por token, solicitado por ${t.solicitado_por_nombre || t.solicitado_por})`]
      )
    } catch (e) { console.warn('[reapertura hist]', e.message) }

    res.json({
      ok: true,
      token_id: t.id,
      mensaje: 'Sección desbloqueada. Ya puedes editarla y volver a cerrarla.',
    })
  } catch (err) { next(err) }
}

// PATCH /api/h360/asistencias/:id/f01
// Actualiza campos de F-01 (información de la solicitud). Requiere token USADO
// reciente por el mismo usuario para esta asistencia y etapa='F01'.
const CAMPOS_F01 = [
  'nombre_ser_querido', 'identificacion', 'contrato', 'certificado_defuncion',
  'peso_aproximado', 'edad', 'fecha_fallecimiento', 'hora_fallecimiento',
  'causa_fallecimiento', 'categoria_sanitaria',
  'lugar_asistencia', 'nombre_contacto', 'telefono_contacto',
  'conductor', 'fecha_contacto',
]
async function actualizarF01(req, res, next) {
  try {
    const { id } = req.params
    const { usuario, rol } = req.user
    const { reapertura_token_id, ...cambios } = req.body || {}

    if (rol !== 'admin') {
      if (!reapertura_token_id)
        return res.status(400).json({ mensaje: 'Se requiere token de reapertura para editar F-01.' })
      const [tok] = await db.query(
        `SELECT id FROM reapertura_tokens
         WHERE id = ? AND asistencia_id = ? AND etapa = 'F01'
           AND estado = 'USADO' AND usado_por = ?
           AND usado_at >= (NOW() - INTERVAL 30 MINUTE)`,
        [reapertura_token_id, id, usuario]
      )
      if (!tok.length)
        return res.status(403).json({ mensaje: 'Token de reapertura inválido o expirado.' })
    }

    const updates = {}
    for (const k of CAMPOS_F01) if (cambios[k] !== undefined) updates[k] = cambios[k]
    if (!Object.keys(updates).length)
      return res.status(400).json({ mensaje: 'Nada que actualizar.' })

    await db.query('UPDATE asistencias SET ? WHERE id = ?', [updates, id])
    const [rows] = await db.query('SELECT * FROM asistencias WHERE id = ?', [id])
    res.json({ ok: true, asistencia: rows[0] })
  } catch (err) { next(err) }
}

module.exports = { solicitar, validar, actualizarF01 }
