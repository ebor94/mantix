/**
 * sync_gestion.service.js
 * Sincroniza filas en gestion_servicios cuando se guarda una visita
 * (servicios adicionales marcados) o una salida (novenario/última noche
 * en residencia). Conserva las filas ya GESTIONADAS/DESCARTADAS y
 * refresca las PENDIENTES según lo que venga marcado ahora.
 */
const db = require('../config/db')

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

/**
 * Sync para una visita de sala.
 * @param {number} visitaId
 * @param {number} homenajeSalaId
 * @param {number|null} asistenciaId
 * @param {object|string|null} serviciosData  Puede venir como {key: {ofrecido:true, ...}} o {key: true}
 * @param {string} usuarioId
 * @param {string|null} nombre
 */
async function syncFromVisita(visitaId, homenajeSalaId, asistenciaId, serviciosData, usuarioId, nombre) {
  const originRef = `VISITA_SALA:${visitaId}`
  const raw = typeof serviciosData === 'string' ? JSON.parse(serviciosData || '{}') : (serviciosData || {})

  const marcados = Object.entries(CATALOGO_SERVICIOS)
    .filter(([key]) => isMarcado(raw[key]))
    .map(([key, label]) => ({ tipo: key, descripcion: label }))

  await sincronizar({
    originRef, origen: 'VISITA_SALA',
    homenajeSalaId, homenajeResidenciaId: null, asistenciaId,
    marcados, usuarioId, nombre,
  })
}

/**
 * Sync para la salida de sala (novenario / última noche en residencia).
 */
async function syncFromSalida(homenajeSalaId, asistenciaId, salidaData, usuarioId, nombre) {
  const originRef = `SALIDA_SALA:${homenajeSalaId}`
  const s = typeof salidaData === 'string' ? JSON.parse(salidaData || '{}') : (salidaData || {})

  const marcados = []
  if ((s.novenario || '').toLowerCase() === 'residencia') {
    marcados.push({ tipo: 'novenario_residencia', descripcion: NOVENARIO_LABEL })
  }
  if ((s.ultima_noche || '').toLowerCase() === 'residencia') {
    marcados.push({ tipo: 'ultima_noche_residencia', descripcion: ULTIMA_NOCHE_LABEL })
  }

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

  // 2) Inserta las nuevas (ignora si ya existen — evita duplicar gestionadas)
  for (const { tipo, descripcion } of marcados) {
    await db.query(
      `INSERT INTO gestion_servicios
       (homenaje_sala_id, homenaje_residencia_id, asistencia_id, tipo_servicio,
        descripcion, origen, origen_ref, ofrecido_por, ofrecido_por_nombre)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         ofrecido_por = COALESCE(ofrecido_por, VALUES(ofrecido_por)),
         ofrecido_por_nombre = COALESCE(ofrecido_por_nombre, VALUES(ofrecido_por_nombre))`,
      [homenajeSalaId, homenajeResidenciaId, asistenciaId, tipo, descripcion,
       origen, originRef, usuarioId, nombre || null]
    )
  }
}

module.exports = { syncFromVisita, syncFromSalida, CATALOGO_SERVICIOS }
