/**
 * identity/controllers/aplicaciones.controller.js
 * Catálogo de aplicaciones del ecosistema SSO.
 */
const identidad = require('../services/identidad.service');
const { OrgAplicacion } = require('../models');

function ok(res, data, status = 200) { return res.status(status).json({ success: true, data }); }
function fail(res, status, code, message) { return res.status(status).json({ success: false, error: code, message }); }

// GET /api/identidad/aplicaciones — devuelve las apps con flag tiene_acceso
async function listarParaIdentidad(req, res) {
  const apps = await identidad.aplicacionesDisponibles(req.identidad.id_identidad);
  return ok(res, apps);
}

// GET /api/identidad/aplicaciones/admin — lista cruda (para admin del catálogo)
async function listarAdmin(req, res) {
  const apps = await OrgAplicacion.findAll({ order: [['app_orden','ASC']] });
  return ok(res, apps);
}

// POST /api/identidad/aplicaciones — crear una nueva app en el catálogo
async function crear(req, res) {
  try {
    const app = await OrgAplicacion.create({
      app_codigo:         req.body.app_codigo,
      app_nombre:         req.body.app_nombre,
      app_descripcion:    req.body.app_descripcion,
      app_url_base:       req.body.app_url_base,
      app_icon:           req.body.app_icon || '📱',
      app_color_hex:      req.body.app_color_hex,
      app_orden:          req.body.app_orden ?? 0,
      app_activa:         req.body.app_activa !== false ? 1 : 0,
      app_tabla_users:    req.body.app_tabla_users || null,
      app_columna_fk:     req.body.app_columna_fk  || null,
      app_columna_activo: req.body.app_columna_activo || 'activo'
    });
    return res.status(201).json({ success: true, data: app });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return fail(res, 409, 'DUPLICATE_CODE', 'Ya existe una app con ese código');
    throw e;
  }
}

async function actualizar(req, res) {
  const app = await OrgAplicacion.findByPk(parseInt(req.params.id));
  if (!app) return fail(res, 404, 'NOT_FOUND', 'App no encontrada');
  await app.update(req.body);
  return ok(res, app);
}

async function eliminar(req, res) {
  const app = await OrgAplicacion.findByPk(parseInt(req.params.id));
  if (!app) return fail(res, 404, 'NOT_FOUND', 'App no encontrada');
  // Soft delete: marca inactiva
  await app.update({ app_activa: 0 });
  return ok(res, { ok: true });
}

module.exports = { listarParaIdentidad, listarAdmin, crear, actualizar, eliminar };
