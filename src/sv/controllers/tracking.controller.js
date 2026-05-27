/**
 * sv/controllers/tracking.controller.js
 * Fase 7 — endpoints de tracking GPS de jornadas.
 */
const tracking = require('../services/tracking.service');
const { SvUsuario } = require('../models');
const { ok, created, noContent, fail } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

/**
 * El usuario actor puede acceder a datos del usuario `usrId` si:
 *  - es el propio (mis recorridos), o
 *  - es SUPERVISOR/ADMIN/SUPER/GERENTE y el usrId pertenece a su área/grupo accesibles.
 */
async function puedeVerUsuario(actor, usrId) {
  if (actor.usr_id === usrId) return true;
  const nivel = actor.rol?.rol_nivel ?? 99;
  if (nivel > 3) return false;          // ASESOR no
  if (actor.rol?.rol_codigo === ROLES.SUPER_ADMIN) return true;
  // Verificar que el usuario destino esté en el grupo/área del actor
  const u = await SvUsuario.findByPk(usrId, { attributes: ['usr_area_id', 'usr_grupo_id'] });
  if (!u) return false;
  // SUPERVISOR ve su grupo principal + grupos extra
  if (actor.rol?.rol_codigo === ROLES.SUPERVISOR) {
    const grupos = new Set();
    if (actor.usr_grupo_id) grupos.add(actor.usr_grupo_id);
    for (const g of (actor.gruposExtra || [])) grupos.add(g.grupo_id);
    return grupos.has(u.usr_grupo_id);
  }
  // JEFE_PAP: solo usuarios del grupo PAP (3)
  if (actor.rol?.rol_codigo === ROLES.JEFE_PAP) {
    return u.usr_grupo_id === 3;
  }
  // ADMIN_AREA / GERENTE: ve usuarios de su área principal + áreas extra
  const areas = new Set();
  if (actor.usr_area_id) areas.add(actor.usr_area_id);
  for (const a of (actor.areasExtra || [])) areas.add(a.area_id);
  return areas.has(u.usr_area_id);
}

async function iniciarJornada(req, res) {
  try {
    const j = await tracking.iniciarJornada(req.user.usr_id, {
      lat:         req.body.lat,
      lng:         req.body.lng,
      dispositivo: req.body.dispositivo || req.headers['user-agent'],
      ip:          req.ip
    });
    return created(res, j);
  } catch (e) {
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'SIN_CONSENTIMIENTO') return fail(res, 409, 'SIN_CONSENTIMIENTO', e.message);
    if (e.code === 'YA_ACTIVA')        return fail(res, 409, 'YA_ACTIVA', e.message);
    throw e;
  }
}

async function finalizarJornada(req, res) {
  try {
    const j = await tracking.finalizarJornada(req.params.id, {
      lat: req.body.lat,
      lng: req.body.lng
    });
    // Verificar dueño
    if (j.jor_usr_id !== req.user.usr_id && req.user.rol?.rol_nivel > 2) {
      return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo puedes finalizar tus propias jornadas');
    }
    return ok(res, j);
  } catch (e) {
    if (e.code === 'NOT_FOUND')      return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'YA_FINALIZADA')  return fail(res, 409, 'YA_FINALIZADA', e.message);
    throw e;
  }
}

async function batchPuntos(req, res) {
  try {
    const r = await tracking.batchPuntos(req.params.id, req.body.puntos);
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'JORNADA_CERRADA')  return fail(res, 409, 'JORNADA_CERRADA', e.message);
    throw e;
  }
}

async function recorrido(req, res) {
  const usrId = parseInt(req.params.usrId);
  if (!(await puedeVerUsuario(req.user, usrId))) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Sin permiso para ver este recorrido');
  }
  try {
    const r = await tracking.recorridoUsuario({ usrId, fecha: req.query.fecha });
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    throw e;
  }
}

async function liveEquipo(req, res) {
  const nivel = req.user.rol?.rol_nivel ?? 99;
  if (nivel > 3) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo supervisor o superior');
  const r = await tracking.liveEquipo({
    grupoId: req.query.grupo_id,
    areaId:  req.query.area_id
  });
  return ok(res, r);
}

async function listarJornadas(req, res) {
  const usrId = req.query.usr_id ? parseInt(req.query.usr_id) : req.user.usr_id;
  if (!(await puedeVerUsuario(req.user, usrId))) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Sin permiso para ver estas jornadas');
  }
  const r = await tracking.listarJornadas({
    usrId, desde: req.query.desde, hasta: req.query.hasta
  });
  return ok(res, r);
}

async function aceptarConsentimiento(req, res) {
  const r = await tracking.aceptarConsentimiento(req.user.usr_id);
  return ok(res, r);
}

async function exportarMisDatos(req, res) {
  const puntos = await tracking.exportarMisDatos(req.user.usr_id, {
    desde: req.query.desde,
    hasta: req.query.hasta
  });
  // CSV
  const head = 'fecha_hora,latitud,longitud,precision_m,velocidad,fuente,jornada_id\n';
  const filas = puntos.map(p => [
    new Date(p.tp_fecha_hora).toISOString(),
    p.tp_lat, p.tp_lng,
    p.tp_precision_m ?? '',
    p.tp_velocidad ?? '',
    p.tp_fuente,
    p.tp_jor_id
  ].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tracking_${req.user.usr_id}_${new Date().toISOString().slice(0,10)}.csv"`);
  return res.send(head + filas);
}

module.exports = {
  iniciarJornada, finalizarJornada, batchPuntos,
  recorrido, liveEquipo, listarJornadas,
  aceptarConsentimiento, exportarMisDatos
};
