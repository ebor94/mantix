/**
 * novedades_externas.controller.js
 *
 * Bandeja del rol asistente_tanatologo: las novedades con el ser querido que
 * le asignaron, para que registre la actividad realizada y las dos firmas.
 *
 * Trae las de los dos orígenes —homenaje en residencia y sala de velación—
 * desde la misma tabla. El ser querido es el mismo trabajo esté donde esté;
 * lo único que cambia es a dónde tiene que ir, y para eso se le dice el lugar.
 */
const db = require('../config/db')
const novedadesSvc = require('../services/novedades.service')

/**
 * El homenaje de cada novedad sale por el lado que corresponda a su origen:
 * homenaje_id apunta a una tabla distinta según sea RESIDENCIA o SALA, así que
 * van los dos JOIN y cada uno solo engancha con las filas de su origen.
 */
const DESDE = `
    FROM h360_homenaje_novedades n
    LEFT JOIN homenajes_residencia hr ON n.origen = 'RESIDENCIA' AND hr.id = n.homenaje_id
    LEFT JOIN homenajes_sala       hs ON n.origen = 'SALA'       AND hs.id = n.homenaje_id
    LEFT JOIN salas_velacion       sv ON sv.id = hs.sala_id
    LEFT JOIN sedes                sd ON sd.id = sv.sede_id
    LEFT JOIN asistencias          a  ON a.id = COALESCE(hr.asistencia_id, hs.asistencia_id)
`

// Dónde está el ser querido, que es lo que el asistente necesita para salir.
const UBICACION = `
         COALESCE(hr.asistencia_id, hs.asistencia_id) AS asistencia_id,
         sv.nombre AS sala_nombre,
         sd.nombre AS sede_nombre,
         CASE WHEN n.origen = 'SALA'
              THEN CONCAT_WS(' · ', sv.nombre, sd.nombre)
              ELSE a.lugar_asistencia END             AS lugar_novedad
`

// GET /api/h360/novedades-externas?estado=PENDIENTE|RESUELTA|all
async function listar(req, res, next) {
  try {
    const { usuario, rol } = req.user
    const { estado = 'PENDIENTE', asignado_a, origen } = req.query

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
    if (origen && novedadesSvc.ORIGENES[origen]) {
      conds.push('n.origen = ?')
      params.push(origen)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const [rows] = await db.query(
      `SELECT n.id, n.origen, n.homenaje_id, n.fecha_reporte, n.hora_reporte,
              n.descripcion_novedad, n.asignado_a, n.asignado_a_nombre,
              n.estado, n.resuelto_at, n.actividad_realizada,
              n.hora_llegada, n.hora_retiro, n.asistente_homenajes,
              n.firma_cliente, n.firma_asistente, n.created_by, n.created_at,
              ${UBICACION},
              a.codigo AS asistencia_codigo,
              a.nombre_ser_querido, a.contrato, a.telefono_contacto, a.lugar_asistencia
       ${DESDE}
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
      `SELECT n.*, ${UBICACION},
              a.codigo AS asistencia_codigo,
              a.nombre_ser_querido, a.contrato, a.telefono_contacto, a.lugar_asistencia
       ${DESDE}
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

    const n = await novedadesSvc.porId(novedadId)
    if (!n) return res.status(404).json({ mensaje: 'Novedad no encontrada' })

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
      `UPDATE h360_homenaje_novedades SET
        actividad_realizada = ?, hora_llegada = ?, hora_retiro = ?,
        firma_cliente = ?, firma_asistente = ?,
        asistente_homenajes = ?,
        estado = 'RESUELTA', resuelto_at = NOW()
       WHERE id = ?`,
      [actividad_realizada.trim(), hora_llegada || null, hora_retiro || null,
       firma_cliente, firma_asistente, nombre || usuario, novedadId]
    )

    // Auditoría, en la tabla del origen de la novedad. No debe tumbar la
    // resolución: la novedad ya quedó resuelta delante de la familia.
    try {
      await novedadesSvc.insertarAuditoria(n.origen, n.homenaje_id, novedadId, 'CREATE',
        null, 'Novedad resuelta por asistente asignado', { usuario, nombre })
    } catch (e) { console.warn('[auditoria novedad]', e.message) }

    res.json({ ok: true, novedad: await novedadesSvc.porId(novedadId) })
  } catch (err) { next(err) }
}

module.exports = { listar, obtener, resolver }
