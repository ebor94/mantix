const router = require('express').Router();
const ctrl = require('../controllers/empresas.controller');
const v    = require('../validations/empresas.validation');
const { validate } = require('../middleware/validate');

router.use(ctrl.requireAreaEmp);

router.get ('/',        validate(v.list, 'query'),   ctrl.list);
router.get ('/buscar',  validate(v.buscar, 'query'), ctrl.buscar);

// Catálogo de tipos de documento (debe ir antes de /:id para no chocar)
router.get   ('/tipos-documento',          ctrl.listarTipos);
router.post  ('/tipos-documento',          ctrl.crearTipo);
router.put   ('/tipos-documento/:tipoId',  ctrl.actualizarTipo);
router.delete('/tipos-documento/:tipoId',  ctrl.eliminarTipo);

router.get ('/:id',     ctrl.getOne);
router.post('/',        validate(v.create),          ctrl.create);
router.put ('/:id',     validate(v.update),          ctrl.update);

// Acciones de supervisor sobre la empresa
router.post ('/:id/reasignar-asesor',           ctrl.reasignarAsesor);
router.patch('/:id/categoria',                  ctrl.actualizarCategoria);
router.post ('/:id/presupuesto/ajustar',        ctrl.ajustarPresupuesto);
router.get  ('/:id/presupuesto/movimientos',    ctrl.listarMovimientos);

// Documentos
router.get   ('/:id/documentos',          ctrl.listarDocumentos);
router.post  ('/:id/documentos',          ctrl.uploadDocumento.single('archivo'), ctrl.subirDocumento);
router.delete('/documentos/:docId',       ctrl.eliminarDocumento);

// Propuestas (archivo, reemplaza generación PDF)
router.get   ('/:id/propuestas-archivo',  ctrl.listarPropuestasArchivo);
router.post  ('/:id/propuestas-archivo',  ctrl.uploadPropuesta.single('archivo'), ctrl.subirPropuestaArchivo);
router.delete('/propuestas-archivo/:propId', ctrl.eliminarPropuestaArchivo);

module.exports = router;
