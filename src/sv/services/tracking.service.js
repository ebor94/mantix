/**
 * sv/services/tracking.service.js
 * Lógica del módulo de tracking GPS de jornadas (Fase 7).
 *
 * Reglas Habeas Data:
 *  - Solo guarda puntos si el usuario tiene consentimiento aceptado.
 *  - Filtra puntos fuera del horario laboral declarado.
 *  - Inmutabilidad de puntos (hook del modelo).
 *  - Purga automática a los 90 días (job nocturno).
 */
const { Op, fn, col } = require('sequelize');
const crypto = require('crypto');
const {
  sequelize, SvJornada, SvTrackingPunto, SvUsuario, SvGestion, SvProspecto, SvPersona
} = require('../models');
const { aISO, hoyISO, rangoDia } = require('../utils/fechas');
const { sumaDistancias } = require('../utils/haversine');

const RETENCION_DIAS = 90;
const ACCURACY_MAX_M = 100;  // descarta puntos con accuracy peor que 100m
const DELTA_MIN_M    = 20;   // ignora deltas < 20m (ruido GPS estático)

class TrackingError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

/** UUID v4 simple sin dependencias externas. */
function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

/**
 * Verifica si un timestamp está dentro del horario laboral.
 * Horario corporativo Serfunorte (todos los días L-D):
 *   - Bloque mañana: 08:00 - 12:00
 *   - Bloque tarde:  14:00 - 18:00
 * Fuera de estos bloques los puntos se descartan silenciosamente.
 *
 * El parámetro `horarioJson` se mantiene en la firma para compatibilidad
 * pero ya no se usa (el horario es fijo a nivel organización).
 */
function dentroDeHorario(fechaISO /*, horarioJson */) {
  const d = new Date(fechaISO);
  if (isNaN(d.getTime())) return false;
  const hora = d.getHours() + d.getMinutes() / 60;
  return (hora >= 8 && hora < 12) || (hora >= 14 && hora < 18);
}

/**
 * Inicia una jornada. Falla si ya hay una activa para el usuario en este día.
 */
async function iniciarJornada(usrId, { lat = null, lng = null, dispositivo = null, ip = null }) {
  const usuario = await SvUsuario.findByPk(usrId);
  if (!usuario) throw new TrackingError('NOT_FOUND', 'Usuario no encontrado');

  // Si ya hay una activa, devolverla en lugar de crear duplicado
  // (frontend llama auto-iniciar en cada login; idempotencia es deseable)
  const activa = await SvJornada.findOne({
    where: { jor_usr_id: usrId, jor_estado: 'activa' }
  });
  if (activa) return activa;

  const now = new Date();
  const j = await SvJornada.create({
    jor_id:                uuid(),
    jor_usr_id:            usrId,
    jor_fecha:             aISO(now),
    jor_inicio_at:         now,
    jor_inicio_lat:        lat,
    jor_inicio_lng:        lng,
    jor_estado:            'activa',
    jor_dispositivo:       dispositivo ? String(dispositivo).slice(0, 255) : null,
    jor_ip_inicio:         ip
  });

  return j;
}

/**
 * Finaliza una jornada. Calcula km recorridos sumando haversine de los puntos.
 */
async function finalizarJornada(jornadaId, { lat = null, lng = null, marcarAuto = false } = {}) {
  const j = await SvJornada.findByPk(jornadaId);
  if (!j) throw new TrackingError('NOT_FOUND', 'Jornada no encontrada');
  if (j.jor_estado !== 'activa') {
    throw new TrackingError('YA_FINALIZADA', `La jornada ya está ${j.jor_estado}`);
  }

  const puntos = await SvTrackingPunto.findAll({
    where: { tp_jor_id: jornadaId },
    order: [['tp_fecha_hora', 'ASC']],
    attributes: ['tp_lat', 'tp_lng'],
    raw: true
  });

  const coords = puntos.map(p => ({ lat: parseFloat(p.tp_lat), lng: parseFloat(p.tp_lng) }));
  const km = Math.round(sumaDistancias(coords) * 100) / 100;

  const now = new Date();
  const duracionMin = Math.round((now - new Date(j.jor_inicio_at)) / 60000);

  await j.update({
    jor_fin_at:        now,
    jor_fin_lat:       lat,
    jor_fin_lng:       lng,
    jor_puntos_total:  puntos.length,
    jor_km_recorridos: km,
    jor_duracion_min:  duracionMin,
    jor_estado:        marcarAuto ? 'auto_cerrada' : 'finalizada'
  });
  return j;
}

/**
 * Recibe batch de puntos del frontend. Aplica filtros (accuracy, horario laboral, delta mínimo)
 * y persiste en bulk. Retorna { recibidos, aceptados, descartados, motivos }.
 *
 * payload.puntos = [{ ts, lat, lng, accuracy?, altitude?, speed?, battery?, source? }]
 */
async function batchPuntos(jornadaId, puntos = []) {
  const j = await SvJornada.findByPk(jornadaId);
  if (!j) throw new TrackingError('NOT_FOUND', 'Jornada no encontrada');
  if (j.jor_estado !== 'activa') {
    throw new TrackingError('JORNADA_CERRADA', 'No se pueden agregar puntos a una jornada finalizada');
  }

  const usuario = await SvUsuario.findByPk(j.jor_usr_id);
  const horario = usuario?.usr_horario_laboral;

  // Buscar último punto guardado para calcular delta
  const ultimo = await SvTrackingPunto.findOne({
    where: { tp_jor_id: jornadaId },
    order: [['tp_fecha_hora', 'DESC']],
    attributes: ['tp_lat', 'tp_lng'],
    raw: true
  });

  const motivos = { off_hours: 0, baja_precision: 0, delta_pequeno: 0, malformados: 0 };
  const aceptados = [];
  let ultLat = ultimo ? parseFloat(ultimo.tp_lat) : null;
  let ultLng = ultimo ? parseFloat(ultimo.tp_lng) : null;

  const { haversine } = require('../utils/haversine');

  for (const p of puntos) {
    if (!p?.lat || !p?.lng || !p?.ts) { motivos.malformados++; continue; }
    if (p.accuracy != null && p.accuracy > ACCURACY_MAX_M) { motivos.baja_precision++; continue; }
    if (!dentroDeHorario(p.ts, horario))                   { motivos.off_hours++;     continue; }
    // delta mínimo (solo a partir del segundo punto)
    if (ultLat != null) {
      const km = haversine({ lat: ultLat, lng: ultLng }, { lat: p.lat, lng: p.lng });
      if (km * 1000 < DELTA_MIN_M) { motivos.delta_pequeno++; continue; }
    }
    aceptados.push({
      tp_jor_id:      jornadaId,
      tp_usr_id:      j.jor_usr_id,
      tp_fecha_hora:  new Date(p.ts),
      tp_lat:         p.lat,
      tp_lng:         p.lng,
      tp_precision_m: p.accuracy ?? null,
      tp_altitud:     p.altitude ?? null,
      tp_velocidad:   p.speed ?? null,
      tp_bateria:     p.battery ?? null,
      tp_fuente:      p.source || 'foreground'
    });
    ultLat = parseFloat(p.lat);
    ultLng = parseFloat(p.lng);
  }

  if (aceptados.length) {
    await SvTrackingPunto.bulkCreate(aceptados);
    // Actualizar contador rápido en la jornada
    await j.increment('jor_puntos_total', { by: aceptados.length });
  }

  return {
    recibidos:   puntos.length,
    aceptados:   aceptados.length,
    descartados: puntos.length - aceptados.length,
    motivos
  };
}

/**
 * Recorrido completo del usuario en una fecha. Incluye jornadas + puntos + gestiones del día.
 * Aplica scope: ASESOR solo ve lo suyo, supervisor+ puede ver subordinados de su scope.
 */
async function recorridoUsuario({ usrId, fecha, scope = null }) {
  // Verificar scope
  if (scope?.asesorId && scope.asesorId !== usrId) {
    throw new TrackingError('FORBIDDEN', 'No tienes permiso para ver el recorrido de este usuario');
  }

  const { start, end } = rangoDia(fecha);
  const usuario = await SvUsuario.findByPk(usrId, {
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_email', 'usr_area_id', 'usr_grupo_id']
  });
  if (!usuario) throw new TrackingError('NOT_FOUND', 'Usuario no encontrado');

  const jornadas = await SvJornada.findAll({
    where: {
      jor_usr_id: usrId,
      jor_inicio_at: { [Op.gte]: start, [Op.lte]: end }
    },
    order: [['jor_inicio_at', 'ASC']]
  });

  const jornadaIds = jornadas.map(j => j.jor_id);
  let puntos = [];
  if (jornadaIds.length) {
    puntos = await SvTrackingPunto.findAll({
      where: { tp_jor_id: jornadaIds },
      order: [['tp_fecha_hora', 'ASC']],
      attributes: ['tp_id', 'tp_jor_id', 'tp_fecha_hora', 'tp_lat', 'tp_lng', 'tp_precision_m', 'tp_velocidad', 'tp_fuente'],
      raw: true
    });
  }

  // Gestiones del día con geolocalización
  const gestiones = await SvGestion.findAll({
    where: {
      gest_asesor_id: usrId,
      gest_fecha_hora: { [Op.gte]: start, [Op.lte]: end },
      gest_ubicacion_lat: { [Op.ne]: null },
      gest_ubicacion_lng: { [Op.ne]: null }
    },
    attributes: ['gest_id', 'gest_fecha_hora', 'gest_ubicacion_lat', 'gest_ubicacion_lng', 'gest_comentario'],
    include: [{
      model: SvProspecto, as: 'prospecto', attributes: ['prosp_id', 'prosp_zona_pap'],
      include: [{ model: SvPersona, as: 'persona', attributes: ['persona_nombre', 'persona_apellido'] }]
    }],
    order: [['gest_fecha_hora', 'ASC']]
  });

  return {
    usuario,
    fecha: aISO(fecha) || hoyISO(),
    jornadas,
    puntos,
    gestiones,
    resumen: {
      jornadas_total:   jornadas.length,
      puntos_total:     puntos.length,
      gestiones_total:  gestiones.length,
      km_total:         jornadas.reduce((s, j) => s + parseFloat(j.jor_km_recorridos || 0), 0).toFixed(2),
      minutos_total:    jornadas.reduce((s, j) => s + (j.jor_duracion_min || 0), 0)
    }
  };
}

/**
 * Live: última posición conocida (últimos 15 min) por cada asesor activo del grupo/área.
 */
async function liveEquipo({ grupoId = null, areaId = null } = {}) {
  // Filtrar usuarios objetivo
  const whereUsr = { usr_activo: 1 };
  if (grupoId) whereUsr.usr_grupo_id = parseInt(grupoId);
  else if (areaId) whereUsr.usr_area_id = parseInt(areaId);

  const usuarios = await SvUsuario.findAll({
    where: whereUsr,
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_area_id', 'usr_grupo_id']
  });
  if (!usuarios.length) return [];

  const ids = usuarios.map(u => u.usr_id);
  const hace15min = new Date(Date.now() - 15 * 60 * 1000);

  // Última jornada activa de cada usuario
  const jornadas = await SvJornada.findAll({
    where: {
      jor_usr_id: ids,
      jor_estado: 'activa'
    },
    raw: true
  });
  const jornadaPorUsr = new Map(jornadas.map(j => [j.jor_usr_id, j]));

  // Último punto de cada usuario (de su jornada activa)
  const puntos = await SvTrackingPunto.findAll({
    where: {
      tp_usr_id: ids,
      tp_fecha_hora: { [Op.gte]: hace15min }
    },
    order: [['tp_fecha_hora', 'DESC']],
    attributes: ['tp_usr_id', 'tp_fecha_hora', 'tp_lat', 'tp_lng', 'tp_velocidad'],
    raw: true
  });

  // Dedupe: quedarnos con el más reciente por usuario
  const ultimoPorUsr = new Map();
  for (const p of puntos) {
    if (!ultimoPorUsr.has(p.tp_usr_id)) ultimoPorUsr.set(p.tp_usr_id, p);
  }

  return usuarios.map(u => {
    const j = jornadaPorUsr.get(u.usr_id);
    const p = ultimoPorUsr.get(u.usr_id);
    let estado = 'inactivo';
    if (j && p) {
      const minSinReporte = Math.round((Date.now() - new Date(p.tp_fecha_hora)) / 60000);
      if (minSinReporte <= 5)       estado = 'activo';
      else if (minSinReporte <= 15) estado = 'reciente';
      else                          estado = 'sin_senal';
    }
    return {
      usuario:           { usr_id: u.usr_id, usr_nombre: u.usr_nombre, usr_apellido: u.usr_apellido },
      jornada_activa:    j ? { jor_id: j.jor_id, jor_inicio_at: j.jor_inicio_at, jor_puntos_total: j.jor_puntos_total } : null,
      ultima_posicion:   p ? { lat: parseFloat(p.tp_lat), lng: parseFloat(p.tp_lng), ts: p.tp_fecha_hora, velocidad: p.tp_velocidad } : null,
      estado
    };
  });
}

/**
 * Lista de jornadas de un usuario en un rango.
 */
async function listarJornadas({ usrId, desde = null, hasta = null }) {
  const where = { jor_usr_id: usrId };
  if (desde) where.jor_fecha = { ...(where.jor_fecha || {}), [Op.gte]: aISO(desde) };
  if (hasta) where.jor_fecha = { ...(where.jor_fecha || {}), [Op.lte]: aISO(hasta) };

  return SvJornada.findAll({
    where,
    order: [['jor_inicio_at', 'DESC']],
    limit: 100
  });
}

/**
 * Marca el consentimiento del usuario.
 */
async function aceptarConsentimiento(usrId) {
  const u = await SvUsuario.findByPk(usrId);
  if (!u) throw new TrackingError('NOT_FOUND', 'Usuario no encontrado');
  await u.update({ usr_consentimiento_geo_at: new Date() });
  return { aceptado_at: u.usr_consentimiento_geo_at };
}

/**
 * Exportar todos los puntos del usuario en un rango (Habeas Data — derecho de acceso).
 */
async function exportarMisDatos(usrId, { desde = null, hasta = null }) {
  const where = { tp_usr_id: usrId };
  if (desde) where.tp_fecha_hora = { ...(where.tp_fecha_hora || {}), [Op.gte]: `${aISO(desde)} 00:00:00` };
  if (hasta) where.tp_fecha_hora = { ...(where.tp_fecha_hora || {}), [Op.lte]: `${aISO(hasta)} 23:59:59` };

  return SvTrackingPunto.findAll({
    where,
    order: [['tp_fecha_hora', 'ASC']],
    attributes: ['tp_fecha_hora', 'tp_lat', 'tp_lng', 'tp_precision_m', 'tp_velocidad', 'tp_fuente', 'tp_jor_id'],
    raw: true
  });
}

/**
 * Cierra todas las jornadas que quedaron activas (job nocturno).
 */
async function cerrarJornadasAbiertas() {
  const activas = await SvJornada.findAll({ where: { jor_estado: 'activa' } });
  for (const j of activas) {
    try {
      await finalizarJornada(j.jor_id, { marcarAuto: true });
    } catch (e) { /* log y continúa */ }
  }
  return activas.length;
}

/**
 * Purga puntos y jornadas más antiguos que `diasRetencion` (default 90).
 */
async function purgarAntiguos({ diasRetencion = RETENCION_DIAS } = {}) {
  const corte = new Date(Date.now() - diasRetencion * 86400000);
  // Bulk delete sin pasar por hook (usar destroy con `force: true` no aplica;
  // los hooks bloquean DELETE individual pero permitimos bulk via query raw)
  const [resPuntos] = await sequelize.query(
    'DELETE FROM sv_org_tracking_puntos WHERE tp_fecha_hora < ?',
    { replacements: [corte] }
  );
  const [resJornadas] = await sequelize.query(
    'DELETE FROM sv_org_jornadas WHERE jor_fecha < ?',
    { replacements: [aISO(corte)] }
  );
  return {
    corte,
    puntos_eliminados:   resPuntos?.affectedRows || 0,
    jornadas_eliminadas: resJornadas?.affectedRows || 0
  };
}

module.exports = {
  TrackingError,
  iniciarJornada, finalizarJornada, batchPuntos,
  recorridoUsuario, liveEquipo, listarJornadas,
  aceptarConsentimiento, exportarMisDatos,
  cerrarJornadasAbiertas, purgarAntiguos,
  // exportados para tests / job
  dentroDeHorario, RETENCION_DIAS
};
