/**
 * sync_gestion.service.js
 * Sincroniza filas en gestion_servicios cuando se guarda una visita
 * (servicios adicionales marcados) o una salida (novenario/última noche
 * en residencia). Conserva las filas ya GESTIONADAS/DESCARTADAS y
 * refresca las PENDIENTES según lo que venga marcado ahora.
 */
const db    = require('../config/db')
const gchat = require('./googleChat.service')

const CATALOGO_SERVICIOS = {
  foto_memorial:        'Foto memorial',
  arreglo_floral:       'Arreglo floral',
  violinista:           'Violinista',
  acomp_espiritual:     'Acompañamiento espiritual',
  coro:                 'Coro (sala / exequias / novenario)',
  transporte_flores:    'Transporte de flores',
  transporte_adicional: 'Transporte adicional de acompañantes',
  visita_virtual_crem:  'Visita virtual a ceremonia de cremación en Jardines',
}
const NOVENARIO_LABEL   = 'Novenario en residencia'
const ULTIMA_NOCHE_LABEL = 'Última noche en residencia'

// Extrae los marcados de novenario/última noche desde un bloque de datos que
// contenga { novenario, ultima_noche, direccion }. Retorna [] si no aplica.
function extraerNovenario(bloque) {
  const raw = typeof bloque === 'string' ? JSON.parse(bloque || '{}') : (bloque || {})
  // Puede venir en la raíz (ingreso/salida) o dentro de _novenario (visita)
  const b = raw._novenario || raw
  const direccion = (b.direccion_novenario || b.direccion || '').trim() || null
  const marcados = []
  if ((b.novenario || '').toLowerCase() === 'residencia') {
    marcados.push({ tipo: 'novenario_residencia', descripcion: NOVENARIO_LABEL, direccion })
  }
  if ((b.ultima_noche || '').toLowerCase() === 'residencia') {
    marcados.push({ tipo: 'ultima_noche_residencia', descripcion: ULTIMA_NOCHE_LABEL, direccion })
  }
  return marcados
}

/**
 * Sync para una visita de sala. Sincroniza servicios adicionales y también
 * novenario/última noche si el bloque de confirmación aparece en la visita.
 */
async function syncFromVisita(visitaId, homenajeSalaId, asistenciaId, serviciosData, usuarioId, nombre, extra) {
  const originRef = `VISITA_SALA:${visitaId}`
  const raw = typeof serviciosData === 'string' ? JSON.parse(serviciosData || '{}') : (serviciosData || {})

  // Un servicio entra al listado si se ofreció o si se vendió; "vendido" es lo
  // que dispara el aviso, "ofrecido" solo deja el registro.
  const marcados = Object.entries(CATALOGO_SERVICIOS)
    .filter(([key]) => isMarcado(raw[key]) || esVendido(raw[key]))
    .map(([key, label]) => ({
      tipo: key, descripcion: label, direccion: null, vendido: esVendido(raw[key]),
    }))

  // Bloque novenario/última noche embebido en la visita (opcional)
  if (extra) marcados.push(...extraerNovenario(extra))

  await sincronizar({
    originRef, origen: 'VISITA_SALA',
    homenajeSalaId, homenajeResidenciaId: null, asistenciaId,
    marcados, usuarioId, nombre,
  })
}

/**
 * Sync para ingreso de sala (novenario / última noche capturados en el ingreso).
 */
async function syncFromIngreso(homenajeSalaId, asistenciaId, ingresoData, usuarioId, nombre) {
  const originRef = `INGRESO_SALA:${homenajeSalaId}`
  const marcados = extraerNovenario(ingresoData)
  await sincronizar({
    originRef, origen: 'INGRESO_SALA',
    homenajeSalaId, homenajeResidenciaId: null, asistenciaId,
    marcados, usuarioId, nombre,
  })
}

/**
 * Sync para la salida de sala (novenario / última noche en residencia).
 */
async function syncFromSalida(homenajeSalaId, asistenciaId, salidaData, usuarioId, nombre) {
  const originRef = `SALIDA_SALA:${homenajeSalaId}`
  const marcados = extraerNovenario(salidaData)
  await sincronizar({
    originRef, origen: 'SALIDA_SALA',
    homenajeSalaId, homenajeResidenciaId: null, asistenciaId,
    marcados, usuarioId, nombre,
  })
}

// ─────────── internos ───────────

function isMarcado(v) {
  if (v === true) return true
  if (v && typeof v === 'object') return v.ofrecido === true || v.marcado === true || v.checked === true
  return false
}

function esVendido(v) {
  return !!(v && typeof v === 'object' && v.vendido === true)
}

async function sincronizar({ originRef, origen, homenajeSalaId, homenajeResidenciaId, asistenciaId, marcados, usuarioId, nombre }) {
  const tiposMarcados = new Set(marcados.map(m => m.tipo))

  // 1) Elimina PENDIENTES que ya no vienen marcados (respeta GESTIONADO/DESCARTADO)
  if (tiposMarcados.size) {
    const placeholders = [...tiposMarcados].map(() => '?').join(',')
    await db.query(
      `DELETE FROM gestion_servicios
       WHERE origen_ref = ? AND estado = 'PENDIENTE'
         AND tipo_servicio NOT IN (${placeholders})`,
      [originRef, ...tiposMarcados]
    )
  } else {
    await db.query(
      `DELETE FROM gestion_servicios
       WHERE origen_ref = ? AND estado = 'PENDIENTE'`,
      [originRef]
    )
  }

  // 2) Inserta las nuevas (ignora si ya existen — evita duplicar gestionadas).
  //    Actualiza direccion en filas PENDIENTES si viene una nueva.
  // Qué había vendido antes de este guardado, para avisar solo de lo que
  // acaba de venderse y no repetirlo en cada guardado posterior.
  const [previos] = await db.query(
    'SELECT tipo_servicio, vendido FROM gestion_servicios WHERE origen_ref = ?', [originRef])
  const vendidosAntes = new Set(previos.filter(p => p.vendido === 1).map(p => p.tipo_servicio))

  const nuevos = []
  for (const { tipo, descripcion, direccion, vendido } of marcados) {
    const [r] = await db.query(
      `INSERT INTO gestion_servicios
       (homenaje_sala_id, homenaje_residencia_id, asistencia_id, tipo_servicio,
        descripcion, vendido, vendido_at, direccion, origen, origen_ref,
        ofrecido_por, ofrecido_por_nombre)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         direccion  = IF(estado = 'PENDIENTE', VALUES(direccion), direccion),
         vendido    = VALUES(vendido),
         vendido_at = IF(VALUES(vendido) = 1, COALESCE(vendido_at, NOW()), NULL),
         ofrecido_por = COALESCE(ofrecido_por, VALUES(ofrecido_por)),
         ofrecido_por_nombre = COALESCE(ofrecido_por_nombre, VALUES(ofrecido_por_nombre))`,
      [homenajeSalaId, homenajeResidenciaId, asistenciaId, tipo, descripcion,
       vendido ? 1 : 0, vendido ? new Date() : null,
       direccion || null, origen, originRef, usuarioId, nombre || null]
    )

    // Novenario y última noche no se venden: avisan al quedar marcados, y por
    // eso se detectan como inserción nueva (affectedRows === 1).
    // Los servicios adicionales avisan al pasar a vendido.
    const esNovenario = tipo === 'novenario_residencia' || tipo === 'ultima_noche_residencia'
    const avisar = esNovenario
      ? r.affectedRows === 1
      : (vendido && !vendidosAntes.has(tipo))
    if (avisar) nuevos.push({ tipo, descripcion, direccion, vendido })
  }

  if (nuevos.length) await notificarServicios({ asistenciaId, nuevos, usuarioId, nombre })
}

/**
 * Avisa al espacio de operaciones de los servicios recién marcados.
 * Nunca lanza: lo importante (el registro en gestion_servicios) ya quedó hecho.
 */
async function notificarServicios({ asistenciaId, nuevos, usuarioId, nombre }) {
  try {
    const [[a]] = await db.query(
      'SELECT codigo, nombre_ser_querido FROM asistencias WHERE id = ?', [asistenciaId])

    const esNovenario  = t => t === 'novenario_residencia' || t === 'ultima_noche_residencia'
    const novenario    = nuevos.filter(n =>  esNovenario(n.tipo))
    const adicionales  = nuevos.filter(n => !esNovenario(n.tipo))

    const lineas = [
      `🎁 *Servicios registrados* — ${a?.codigo || 'asistencia ' + asistenciaId}`,
      `Ser querido: ${a?.nombre_ser_querido || 's/n'}`,
    ]
    if (novenario.length) {
      lineas.push('', '*Confirmación de novenario / última noche*')
      novenario.forEach(n => lineas.push(`• ${n.descripcion}${n.direccion ? ` — ${n.direccion}` : ''}`))
    }
    if (adicionales.length) {
      lineas.push('', '💰 *Servicios adicionales VENDIDOS*')
      adicionales.forEach(n => lineas.push(`• ${n.descripcion}`))
    }
    lineas.push('', `Registró: ${nombre || usuarioId}`)

    await gchat.enviarOperaciones(lineas.join('\n'))
  } catch (err) {
    console.warn('[sync_gestion] notificarServicios:', err.message)
  }
}

module.exports = { syncFromIngreso, syncFromVisita, syncFromSalida, CATALOGO_SERVICIOS }
