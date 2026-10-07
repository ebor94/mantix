/**
 * novedades.service.js
 *
 * Novedades con el ser querido. Las registra quien está a cargo del homenaje
 * —en residencia o en sala de velación— y las resuelve el asistente tanatólogo
 * asignado, desde su bandeja, con la actividad realizada y las dos firmas.
 *
 * Viven todas en h360_homenaje_novedades con el origen como columna, para que
 * la bandeja del asistente sea una sola consulta y un solo espacio de
 * identificadores. Lo que cambia entre un origen y otro es a qué tabla de
 * homenajes apunta homenaje_id y en qué tabla de auditoría queda el rastro;
 * eso es lo que resuelve ORIGENES.
 *
 * Las funciones lanzan errores con `status` para que el controlador los
 * traduzca a la respuesta HTTP sin repetir validaciones.
 */
const db = require('../config/db')

const TABLA = 'h360_homenaje_novedades'

const ORIGENES = {
  RESIDENCIA: { homenajes: 'homenajes_residencia', auditoria: 'homenaje_residencia_auditoria', fk: 'homenaje_residencia_id' },
  SALA:       { homenajes: 'homenajes_sala',       auditoria: 'homenaje_sala_auditoria',       fk: 'homenaje_sala_id'       },
}

function falla(status, mensaje) {
  return Object.assign(new Error(mensaje), { status })
}

function config(origen) {
  const c = ORIGENES[origen]
  if (!c) throw falla(500, `Origen de novedad desconocido: ${origen}`)
  return c
}

/**
 * Una novedad firmada ya la cerró el asistente delante de la familia: deja de
 * ser editable salvo por admin, y con motivo.
 */
function firmada(row) {
  const fc = row?.firma_cliente
  const fa = row?.firma_asistente
  return !!((fc && String(fc).length > 20) || (fa && String(fa).length > 20))
}

/** Rastro del cambio en la auditoría del origen que corresponda. */
async function insertarAuditoria(origen, homenajeId, novedadId, accion, snapshot, motivo, user = {}) {
  const c = config(origen)
  await db.query(
    `INSERT INTO ${c.auditoria}
     (${c.fk}, novedad_id, seccion, accion, snapshot_anterior, motivo, usuario_id, nombre_usuario)
     VALUES (?,?,'NOVEDAD',?,?,?,?,?)`,
    [homenajeId, novedadId, accion, snapshot ? JSON.stringify(snapshot) : null,
     motivo || null, user.usuario, user.nombre || null]
  )
}

/** Las novedades de un homenaje, para pintarlas en su pestaña. */
async function listarDe(origen, homenajeId) {
  config(origen)
  const [rows] = await db.query(
    `SELECT * FROM ${TABLA} WHERE origen = ? AND homenaje_id = ?
      ORDER BY fecha_reporte DESC, hora_reporte DESC, id DESC`,
    [origen, homenajeId])
  return rows
}

async function porId(novedadId) {
  const [[n]] = await db.query(`SELECT * FROM ${TABLA} WHERE id = ?`, [novedadId])
  return n || null
}

/**
 * Registra la novedad y la asigna. La resolución —actividad y firmas— la hace
 * el asistente desde /novedades-externas, no desde aquí.
 */
async function agregar(origen, homenajeId, datos, usuario) {
  const c = config(origen)
  const { fecha_reporte, hora_reporte, descripcion_novedad, asignado_a, asignado_a_nombre } = datos

  if (!fecha_reporte)                  throw falla(400, 'fecha_reporte requerido')
  if (!descripcion_novedad?.trim())    throw falla(400, 'descripcion_novedad requerida')
  if (!asignado_a?.trim())             throw falla(400, 'Debes asignar la novedad a un asistente.')

  const [existe] = await db.query(`SELECT id FROM ${c.homenajes} WHERE id = ?`, [homenajeId])
  if (!existe.length) throw falla(404, 'Homenaje no encontrado')

  const [r] = await db.query(
    `INSERT INTO ${TABLA}
     (origen, homenaje_id, fecha_reporte, hora_reporte,
      descripcion_novedad, asignado_a, asignado_a_nombre, estado, created_by)
     VALUES (?,?,?,?,?,?,?, 'PENDIENTE', ?)`,
    [origen, homenajeId, fecha_reporte, hora_reporte || null,
     descripcion_novedad.trim(), asignado_a.trim(), asignado_a_nombre || null, usuario])

  return porId(r.insertId)
}

const CAMPOS_EDITABLES = ['fecha_reporte', 'hora_reporte', 'asistente_homenajes',
  'hora_llegada', 'hora_retiro', 'actividad_realizada', 'firma_cliente', 'firma_asistente']

async function actualizar(origen, homenajeId, novedadId, cambios, user) {
  config(origen)
  const { motivo, ...resto } = cambios

  const [[prev]] = await db.query(
    `SELECT * FROM ${TABLA} WHERE id = ? AND origen = ? AND homenaje_id = ?`,
    [novedadId, origen, homenajeId])
  if (!prev) throw falla(404, 'Novedad no encontrada')

  const yaFirmada = firmada(prev)
  if (yaFirmada) {
    if (user.rol !== 'admin')
      throw falla(423, 'La novedad está firmada y bloqueada. Solo admin puede modificarla.')
    if (!motivo?.trim())
      throw falla(400, 'Debes indicar el motivo para modificar una novedad firmada.')
    await insertarAuditoria(origen, homenajeId, novedadId, 'UPDATE', prev, motivo.trim(), user)
  }

  const campos = {}
  for (const k of CAMPOS_EDITABLES) if (resto[k] !== undefined) campos[k] = resto[k]
  if (!Object.keys(campos).length) throw falla(400, 'Nada que actualizar')

  await db.query(`UPDATE ${TABLA} SET ? WHERE id = ?`, [campos, novedadId])
  return { novedad: await porId(novedadId), desbloqueado: yaFirmada }
}

module.exports = {
  TABLA, ORIGENES,
  firmada, listarDe, porId, agregar, actualizar, insertarAuditoria,
}
