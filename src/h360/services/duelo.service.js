/**
 * duelo.service.js
 * Acceso a MySQL de la gestión del R-56: gestión, intentos y servicios
 * ofrecidos. Las atenciones NO están acá: viven en duelo_atenciones.service.js
 * porque son dato de salud con permiso propio.
 */
const db = require('../config/db')
const { normalizarFechaHora } = require('../utils/fecha_hora')
const { malUso } = require('../utils/errores')
const cat = require('../utils/duelo.catalogos')

async function gestionPorOrden(orden) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_gestion WHERE orden_servicio = ?', [String(orden ?? '').trim()])
  return f[0] || null
}

async function gestionesPorOrdenes(ordenes) {
  const lista = (ordenes || []).map(o => String(o).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT * FROM h360_duelo_gestion WHERE orden_servicio IN (${lista.map(() => '?').join(',')})`,
    lista)
  return new Map(filas.map(f => [f.orden_servicio, f]))
}

async function crearGestion(datos) {
  if (!cat.UBICACIONES.includes(datos.ubicacion_tipo))
    throw malUso('La ubicación del homenaje no es válida')
  const [r] = await db.query(
    `INSERT INTO h360_duelo_gestion
       (orden_servicio, asistencia_id, ubicacion_tipo, ubicacion_detalle, es_mascota,
        titular_nombre, titular_parentesco, telefonos, estado, psicologa, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [datos.orden_servicio, datos.asistencia_id ?? null, datos.ubicacion_tipo,
     datos.ubicacion_detalle ?? null, datos.es_mascota ? 1 : 0,
     datos.titular_nombre ?? null, datos.titular_parentesco ?? null,
     datos.telefonos ?? null, datos.estado ?? 'EN_GESTION',
     datos.psicologa, datos.created_by])
  return r.insertId
}

const CAMPOS_EDITABLES = [
  'asistencia_id', 'ubicacion_tipo', 'ubicacion_detalle', 'titular_nombre',
  'titular_parentesco', 'telefonos', 'tipificacion', 'estado', 'observaciones',
  'psicologa', 'psicologa_acompanante', 'cerrada_at',
]

async function actualizarGestion(id, cambios) {
  const set = {}
  for (const k of CAMPOS_EDITABLES) if (cambios[k] !== undefined) set[k] = cambios[k]

  if (set.ubicacion_tipo !== undefined && !cat.UBICACIONES.includes(set.ubicacion_tipo))
    throw malUso('La ubicación del homenaje no es válida')
  if (set.tipificacion != null && !cat.TIPIFICACIONES.includes(set.tipificacion))
    throw malUso('La tipificación no es válida')
  if (set.estado !== undefined && !cat.ESTADOS_GESTION.includes(set.estado))
    throw malUso('El estado de la gestión no es válido')

  if (!Object.keys(set).length) return false
  const [r] = await db.query('UPDATE h360_duelo_gestion SET ? WHERE id = ?', [set, id])
  return r.affectedRows > 0
}

async function agregarIntento(gestionId, { momento, canal, resultado, observacion, usuario }) {
  if (!cat.CANALES_INTENTO.includes(canal))
    throw malUso('El canal del intento no es válido')
  if (!cat.RESULTADOS_INTENTO.includes(resultado))
    throw malUso('El resultado del intento no es válido')
  const cuando = normalizarFechaHora(momento)
  if (!cuando) throw malUso('La fecha y hora del intento no es válida')

  const [r] = await db.query(
    `INSERT INTO h360_duelo_intentos (gestion_id, momento, canal, resultado, observacion, usuario)
     VALUES (?,?,?,?,?,?)`,
    [gestionId, cuando, canal, resultado, observacion ?? null, usuario])
  return r.insertId
}

async function intentosDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_intentos WHERE gestion_id = ? ORDER BY momento ASC, id ASC',
    [gestionId])
  return f
}

/**
 * Guarda los seis servicios de una vez. Es un reemplazo completo del estado de
 * la gestión: así la pantalla manda lo que tiene y no hay que llevar la cuenta
 * de qué cambió.
 */
async function guardarServicios(gestionId, lista) {
  for (const s of lista || []) {
    if (!cat.SERVICIOS.includes(s.servicio))
      throw malUso(`El servicio ${s.servicio} no es uno de los del R-56`)
    if (!cat.ESTADOS_SERVICIO.includes(s.estado))
      throw malUso(`El estado ${s.estado} no es válido para un servicio`)
    if (s.modalidad != null && !cat.MODALIDADES.includes(s.modalidad))
      throw malUso(`La modalidad ${s.modalidad} no es válida`)
  }
  if (!lista?.length) return

  const valores = lista.map(s => [
    gestionId, s.servicio, s.estado, s.modalidad ?? null,
    s.detalle ?? null, s.observacion ?? null,
  ])
  await db.query(
    `INSERT INTO h360_duelo_servicios
       (gestion_id, servicio, estado, modalidad, detalle, observacion)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       estado = VALUES(estado), modalidad = VALUES(modalidad),
       detalle = VALUES(detalle), observacion = VALUES(observacion)`,
    [valores])
}

async function serviciosDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_servicios WHERE gestion_id = ?', [gestionId])
  return f
}

module.exports = {
  gestionPorOrden, gestionesPorOrdenes, crearGestion, actualizarGestion,
  agregarIntento, intentosDeGestion, guardarServicios, serviciosDeGestion,
}
