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
  // Se recorta igual que en gestionPorOrden: si se guardara con espacios, la
  // clave única los conservaría y la gestión no se volvería a encontrar.
  const orden = String(datos.orden_servicio ?? '').trim()
  if (!orden) throw malUso('El número de orden es obligatorio')
  if (!cat.UBICACIONES.includes(datos.ubicacion_tipo))
    throw malUso('La ubicación del homenaje no es válida')
  const estado = datos.estado ?? 'EN_GESTION'
  if (!cat.ESTADOS_GESTION.includes(estado))
    throw malUso('El estado de la gestión no es válido')
  const [r] = await db.query(
    `INSERT INTO h360_duelo_gestion
       (orden_servicio, asistencia_id, ubicacion_tipo, ubicacion_detalle, es_mascota,
        titular_nombre, titular_parentesco, telefonos, estado, psicologa, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [orden, datos.asistencia_id ?? null, datos.ubicacion_tipo,
     datos.ubicacion_detalle ?? null, datos.es_mascota ? 1 : 0,
     datos.titular_nombre ?? null, datos.titular_parentesco ?? null,
     datos.telefonos ?? null, estado,
     datos.psicologa, datos.created_by])
  return r.insertId
}

// cerrada_at NO es editable: lo pone el servidor, no el cliente. Una gestión se
// cierra *ahora*, cuando alguien la cierra; el cliente no tiene por qué elegir
// esa hora. Además, un valor que entrara por acá sin pasar por
// normalizarFechaHora repetiría la trampa de UTC: una gestión cerrada a las
// 14:30 quedaría guardada a las 19:30. La fija actualizarGestion según el estado.
const CAMPOS_EDITABLES = [
  'asistencia_id', 'ubicacion_tipo', 'ubicacion_detalle', 'titular_nombre',
  'titular_parentesco', 'telefonos', 'tipificacion', 'estado', 'observaciones',
  'psicologa', 'psicologa_acompanante',
]

// Estados que cierran la gestión. Cualquier otro estado del catálogo
// (PENDIENTE, EN_GESTION) la deja abierta.
const ESTADOS_QUE_CIERRAN = ['GESTIONADA', 'NO_LOGRADA', 'NO_APLICA', 'REPETIDA']

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

  // cerrada_at va como fragmento fijo del SQL y no dentro de `set`: en el objeto
  // del `SET ?` NOW() se escaparía como texto ('NOW()') y la columna no
  // quedaría con la hora. Así se usa el reloj de la base y la gestión se cierra
  // (o se reabre) en la misma escritura que cambia el estado. Los fragmentos son
  // constantes: nada que venga del cliente se concatena al SQL.
  //
  // Al cerrar se usa COALESCE(cerrada_at, NOW()) y no NOW() a secas: cerrada_at
  // es un dato de auditoría («cuándo se cerró el caso»), no un timestamp de
  // modificación. Si el formulario manda `estado` en cada guardado, un NOW()
  // pelado correría la hora de cierre con cada corrección de una observación.
  // Así se conserva la primera hora mientras la gestión siga cerrada; para
  // «última modificación» ya está updated_at, que la tabla actualiza sola.
  // La reapertura sí produce una hora nueva: reabrir deja cerrada_at en NULL, y
  // al volver a cerrar COALESCE(NULL, NOW()) da NOW(), la hora del nuevo cierre.
  // (cerrada_at no está en CAMPOS_EDITABLES, así que nunca va en `set` y
  // COALESCE lee el valor que la fila tenía antes de esta escritura.)
  let cierre = ''
  if (set.estado !== undefined)
    cierre = ESTADOS_QUE_CIERRAN.includes(set.estado)
      ? ', cerrada_at = COALESCE(cerrada_at, NOW())'
      : ', cerrada_at = NULL'

  const [r] = await db.query(
    `UPDATE h360_duelo_gestion SET ?${cierre} WHERE id = ?`, [set, id])
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
  // `momento` se formatea en SQL y viaja como texto de hora de pared. El pool no
  // define dateStrings, así que un DATETIME llegaría como Date y Express lo
  // serializaría en UTC: un intento de las 14:30 en Cúcuta (UTC-5) saldría como
  // 19:30Z. Con el texto ya armado, ningún consumidor hace aritmética de zonas.
  // El ORDER BY califica `momento` con la tabla a propósito: sin el nombre de la
  // tabla, MySQL resuelve `momento` al alias de texto del SELECT, que llega solo
  // hasta el minuto y pierde los segundos. Dos intentos del mismo minuto
  // quedarían ordenados por id y no por su hora real, y como la respuesta ya no
  // muestra los segundos, nadie vería el desorden. Calificada, ordena por el
  // DATETIME real (y puede usar el índice idx_gestion (gestion_id, momento)).
  // No se devuelve created_at: saldría como Date junto a momento como texto, y
  // ninguna pantalla lo usa. Si se necesita, se agrega con el mismo formateo.
  const [f] = await db.query(
    `SELECT id, gestion_id, DATE_FORMAT(momento, '%Y-%m-%d %H:%i') AS momento,
            canal, resultado, observacion, usuario
       FROM h360_duelo_intentos WHERE gestion_id = ?
      ORDER BY h360_duelo_intentos.momento ASC, id ASC`,
    [gestionId])
  return f
}

/**
 * Guarda de una vez los servicios que vengan en la lista. Es un upsert por
 * (gestión, servicio): los que vienen se insertan o se actualizan, y un
 * servicio que NO viene conserva lo que tenía. Por eso no hay forma de volver
 * un servicio a «sin registrar» mandando una lista más corta: solo se puede
 * cambiar su estado.
 */
async function guardarServicios(gestionId, lista) {
  for (const s of lista || []) {
    if (!cat.SERVICIOS.includes(s.servicio))
      throw malUso(`El servicio ${s.servicio} no es uno de los del R-56`)
    if (!cat.ESTADOS_SERVICIO.includes(s.estado))
      throw malUso(`El estado ${s.estado} no es válido para un servicio`)
    if (s.modalidad != null && !cat.MODALIDADES.includes(s.modalidad))
      throw malUso(`La modalidad ${s.modalidad} no es válida`)
    // En la misa de mes el detalle es la religión. Vacío es válido: puede no
    // haberse preguntado todavía. En los otros cinco servicios no se valida.
    if (s.servicio === 'MISA_DE_MES' && s.detalle != null && s.detalle !== ''
        && !cat.RELIGIONES_MISA.includes(s.detalle))
      throw malUso(`La religión ${s.detalle} no es válida para la misa de mes`)
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
