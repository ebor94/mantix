const { Router } = require('express');
const controller = require('../controllers/empresaAdmin.controller');
const validate = require('../middleware/validate');
const { auth, requirePermiso } = require('../middleware/auth');
const {
  crearEmpresaAdminSchema, editarEmpresaAdminSchema, editarPlanSchema, parametroSchema
} = require('../validations/empresaAdmin.validation');

const router = Router();
const guard = [auth, requirePermiso('empresa', 'administrar')];

// Parámetros del canal (van antes de /:id para no colisionar)
router.get('/parametros', guard, controller.listarParametros);
router.post('/parametros', guard, validate(parametroSchema), controller.crearParametro);
router.put('/parametros/:anio', guard, validate(parametroSchema), controller.editarParametro);
router.post('/parametros/:anio/activar', guard, controller.activarParametro);

// Asesores para el selector (va antes de /:id para no colisionar)
router.get('/asesores', guard, controller.listarAsesores);

// Empresas
router.get('/', guard, controller.listar);
router.post('/', guard, validate(crearEmpresaAdminSchema), controller.crear);
router.put('/:id', guard, validate(editarEmpresaAdminSchema), controller.editar);

// Planes de una empresa
router.put('/:id/planes/:planTipo', guard, validate(editarPlanSchema), controller.editarPlan);

module.exports = router;
