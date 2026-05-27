/**
 * sv/controllers/config.controller.js
 * Bootstrap + CRUD de catálogos sv_cfg_*.
 */
const { SvArea, SvGrupo, SvProducto, SvEstado, SvResultado, SvFuente, SvPunto } = require('../models');
const { getBootstrap } = require('../services/config.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');
const { areaIdsAccesibles } = require('../utils/acceso');

// -------- Bootstrap --------
async function bootstrap(req, res) {
  const areaId = parseInt(req.query.area_id || req.user.usr_area_id);
  if (!areaId) return fail(res, 400, ERROR_CODES.VALIDATION_ERROR, 'area_id requerido');

  // Multi-área: validar contra todas las áreas accesibles del usuario (principal + extras)
  if (req.user.rol?.rol_codigo !== ROLES.SUPER_ADMIN) {
    const ids = areaIdsAccesibles(req.user);  // null = sin filtro (super admin), array = accesibles
    if (ids !== null && !ids.includes(areaId)) {
      return fail(res, 403, ERROR_CODES.FORBIDDEN, 'No tienes acceso a esta área');
    }
  }

  const payload = await getBootstrap(areaId);
  if (!payload) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Área no encontrada');
  return ok(res, payload);
}

// -------- Generic helpers --------
function listFactory(Model, defaultOrder) {
  return async (_req, res) => {
    const items = await Model.findAll({ order: defaultOrder });
    return ok(res, items);
  };
}

function createFactory(Model) {
  return async (req, res) => {
    try {
      const item = await Model.create(req.body);
      return created(res, item);
    } catch (e) {
      if (e.name === 'SequelizeUniqueConstraintError') {
        return fail(res, 409, ERROR_CODES.VALIDATION_ERROR, 'Código duplicado');
      }
      throw e;
    }
  };
}

function updateFactory(Model, pkName) {
  return async (req, res) => {
    const id = parseInt(req.params.id);
    const item = await Model.findByPk(id);
    if (!item) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado');
    await item.update(req.body);
    return ok(res, item);
  };
}

function toggleFactory(Model, activeField) {
  return async (req, res) => {
    const id = parseInt(req.params.id);
    const item = await Model.findByPk(id);
    if (!item) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado');
    await item.update({ [activeField]: item[activeField] ? 0 : 1 });
    return ok(res, item);
  };
}

module.exports = {
  bootstrap,
  // Áreas
  listAreas:   listFactory(SvArea, [['area_id', 'ASC']]),
  createArea:  createFactory(SvArea),
  updateArea:  updateFactory(SvArea, 'area_id'),
  toggleArea:  toggleFactory(SvArea, 'area_activa'),
  // Grupos
  listGrupos:  listFactory(SvGrupo, [['grupo_id', 'ASC']]),
  createGrupo: createFactory(SvGrupo),
  updateGrupo: updateFactory(SvGrupo, 'grupo_id'),
  toggleGrupo: toggleFactory(SvGrupo, 'grupo_activo'),
  // Productos
  listProductos:  listFactory(SvProducto, [['prod_area_id', 'ASC'], ['prod_orden_display', 'ASC']]),
  createProducto: createFactory(SvProducto),
  updateProducto: updateFactory(SvProducto, 'prod_id'),
  toggleProducto: toggleFactory(SvProducto, 'prod_activo'),
  // Estados
  listEstados:    listFactory(SvEstado, [['estado_grupo_id', 'ASC'], ['estado_orden', 'ASC']]),
  createEstado:   createFactory(SvEstado),
  updateEstado:   updateFactory(SvEstado, 'estado_id'),
  toggleEstado:   toggleFactory(SvEstado, 'estado_activo'),
  // Resultados
  listResultados:  listFactory(SvResultado, [['resultado_grupo_id', 'ASC'], ['resultado_orden', 'ASC']]),
  createResultado: createFactory(SvResultado),
  updateResultado: updateFactory(SvResultado, 'resultado_id'),
  toggleResultado: toggleFactory(SvResultado, 'resultado_activo'),
  // Fuentes
  listFuentes:    listFactory(SvFuente, [['fuente_area_id', 'ASC'], ['fuente_orden', 'ASC']]),
  createFuente:   createFactory(SvFuente),
  updateFuente:   updateFactory(SvFuente, 'fuente_id'),
  toggleFuente:   toggleFactory(SvFuente, 'fuente_activa'),
  // Puntos
  listPuntos:     listFactory(SvPunto, [['punto_codigo', 'ASC']]),
  createPunto:    createFactory(SvPunto),
  updatePunto:    updateFactory(SvPunto, 'punto_id'),
  togglePunto:    toggleFactory(SvPunto, 'punto_activo')
};
