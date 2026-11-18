/**
 * sv/controllers/gestiones.controller.js
 * Registrar una gestión o ver su historial exige que el prospecto esté en el
 * alcance del usuario (utils/alcanceProspecto). Los errores se reenvían con
 * next(e): en Express 4 una promesa rechazada en un handler async no llega al
 * middleware de errores y server.js termina el proceso ante un
 * unhandledRejection.
 */
const gestiones  = require('../services/gestiones.service');
const prospectos = require('../services/prospectos.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { fueraDeAlcance } = require('../utils/alcanceProspecto');
const { usuariosAccesibles } = require('../utils/acceso');

// Carga el prospecto y verifica el alcance. Devuelve el prospecto, o null si
// ya respondió 404 / 403.
async function prospectoVisible(req, res, prospId) {
  const p = await prospectos.obtenerAlcance(prospId);
  if (!p) {
    fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');
    return null;
  }
  const motivo = fueraDeAlcance(req.user, req.scope, p);
  if (motivo) {
    fail(res, 403, ERROR_CODES.FORBIDDEN, motivo);
    return null;
  }
  return p;
}

async function create(req, res, next) {
  try {
    if (!(await prospectoVisible(req, res, req.body.gest_prosp_id))) return;
    const g = await gestiones.crear(req.body, req.user.usr_id);
    return created(res, g);
  } catch (e) {
    return next(e);
  }
}

async function list(req, res, next) {
  try {
    const prospId = parseInt(req.query.prosp_id);
    if (!(await prospectoVisible(req, res, prospId))) return;
    const r = await gestiones.historial(prospId, { page: req.query.page, limit: req.query.limit });
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

// De quién es el resumen que se pide. ASESOR / AGENTE_SVC: siempre el propio
// (se ignora asesor_id, igual que aplicarFiltroAsesor en prospectos). Resto:
// el propio, o el de un asesor que esté en usuariosAccesibles(actor).
// Devuelve null si el asesor pedido está fuera del alcance.
async function resolverAsesorResumen(req) {
  const propio = req.user.usr_id;
  if (req.scope?.asesorId) return propio;
  const pedido = req.query.asesor_id ? parseInt(req.query.asesor_id) : null;
  if (!pedido || pedido === propio) return propio;
  const ids = await usuariosAccesibles(req.user); // null = SUPER_ADMIN, sin filtro
  if (ids === null || ids.map(Number).includes(pedido)) return pedido;
  return null;
}

async function resumenDia(req, res, next) {
  try {
    const asesorId = await resolverAsesorResumen(req);
    if (asesorId === null) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu alcance');
    const r = await gestiones.resumenDia(asesorId, req.query.fecha);
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

module.exports = { create, list, resumenDia };
