/**
 * sv/routes/config.routes.js
 * Bootstrap + CRUD catálogos. Lectura abierta a autenticados; mutación restringida.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/config.controller');
const v      = require('../validations/config.validation');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/svAuthorize');

const mutators = authorize('SUPER_ADMIN', 'ADMIN_AREA');

// Bootstrap
router.get('/bootstrap', ctrl.bootstrap);

// Áreas (lectura: cualquier autenticado; mutación: solo SUPER_ADMIN — área es global)
router.get   ('/areas',        ctrl.listAreas);
router.post  ('/areas',        authorize('SUPER_ADMIN'), validate(v.area.create),  ctrl.createArea);
router.put   ('/areas/:id',    authorize('SUPER_ADMIN'), validate(v.area.update),  ctrl.updateArea);
router.patch ('/areas/:id/toggle', authorize('SUPER_ADMIN'), ctrl.toggleArea);

// Grupos
router.get   ('/grupos',       ctrl.listGrupos);
router.post  ('/grupos',       mutators, validate(v.grupo.create), ctrl.createGrupo);
router.put   ('/grupos/:id',   mutators, validate(v.grupo.update), ctrl.updateGrupo);
router.patch ('/grupos/:id/toggle', mutators, ctrl.toggleGrupo);

// Productos
router.get   ('/productos',       ctrl.listProductos);
router.post  ('/productos',       mutators, validate(v.producto.create), ctrl.createProducto);
router.put   ('/productos/:id',   mutators, validate(v.producto.update), ctrl.updateProducto);
router.patch ('/productos/:id/toggle', mutators, ctrl.toggleProducto);

// Estados (pipeline)
router.get   ('/estados',       ctrl.listEstados);
router.post  ('/estados',       mutators, validate(v.estado.create), ctrl.createEstado);
router.put   ('/estados/:id',   mutators, validate(v.estado.update), ctrl.updateEstado);
router.patch ('/estados/:id/toggle', mutators, ctrl.toggleEstado);

// Resultados de gestión
router.get   ('/resultados',       ctrl.listResultados);
router.post  ('/resultados',       mutators, validate(v.resultado.create), ctrl.createResultado);
router.put   ('/resultados/:id',   mutators, validate(v.resultado.update), ctrl.updateResultado);
router.patch ('/resultados/:id/toggle', mutators, ctrl.toggleResultado);

// Fuentes de prospecto
router.get   ('/fuentes',       ctrl.listFuentes);
router.post  ('/fuentes',       mutators, validate(v.fuente.create), ctrl.createFuente);
router.put   ('/fuentes/:id',   mutators, validate(v.fuente.update), ctrl.updateFuente);
router.patch ('/fuentes/:id/toggle', mutators, ctrl.toggleFuente);

// Puntos de atención
router.get   ('/puntos',        ctrl.listPuntos);
router.post  ('/puntos',        authorize('SUPER_ADMIN'), validate(v.punto.create), ctrl.createPunto);
router.put   ('/puntos/:id',    authorize('SUPER_ADMIN'), validate(v.punto.update), ctrl.updatePunto);
router.patch ('/puntos/:id/toggle', authorize('SUPER_ADMIN'), ctrl.togglePunto);

module.exports = router;
