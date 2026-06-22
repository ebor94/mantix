/**
 * sv/controllers/categorizacionEmpresa.controller.js
 * Endpoints de tipos de empresa y grupos empresariales (migración 017).
 */
const tipos  = require('../services/tiposEmpresa.service');
const grupos = require('../services/gruposEmpresariales.service');
const { ok, created, fail, noContent } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA];

function esAdmin(req) {
  return ADMIN_ROLES.includes(req.user?.rol?.rol_codigo);
}

// ─── Tipos de empresa (admin) ────────────────────────────────────────────────

async function listarTipos(req, res) {
  const r = await tipos.list(req.query);
  return ok(res, r);
}

async function crearTipo(req, res) {
  if (!esAdmin(req)) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo administradores');
  try {
    const r = await tipos.crear(req.body);
    return created(res, r);
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    if (e.code === 'DUPLICATE')        return fail(res, 409, 'DUPLICATE',                  e.message);
    throw e;
  }
}

async function actualizarTipo(req, res) {
  if (!esAdmin(req)) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo administradores');
  try {
    const r = await tipos.actualizar(parseInt(req.params.id), req.body);
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    throw e;
  }
}

// ─── Grupos empresariales (todos los logueados pueden listar/crear al vuelo) ──

async function listarGrupos(req, res) {
  const r = await grupos.list(req.query);
  return ok(res, r);
}

async function crearGrupo(req, res) {
  try {
    const { grupo, creado } = await grupos.findOrCreate({
      nombre:      req.body.nombre,
      descripcion: req.body.descripcion,
      creadoPor:   req.user.usr_id
    });
    return res.status(creado ? 201 : 200).json({ success: true, data: { grupo, creado } });
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

async function actualizarGrupo(req, res) {
  if (!esAdmin(req)) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo administradores pueden editar grupos');
  try {
    const r = await grupos.actualizar(parseInt(req.params.id), req.body);
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    throw e;
  }
}

module.exports = {
  listarTipos, crearTipo, actualizarTipo,
  listarGrupos, crearGrupo, actualizarGrupo
};
