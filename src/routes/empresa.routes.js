const { Router } = require('express');
const controller = require('../controllers/empresa.controller');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const { strictRateLimit } = require('../middleware/strictRateLimit');
const { createEmpresaSchema } = require('../validations/afiliado.validation');

const router = Router();

// Mitigación intermedia (Task 1.1, decisión de la controller tras BLOCKED):
// GET /:nit se mantiene público (lo consumen los flujos públicos de Veolia y
// corrección, canal EMPRESARIAL) pero con rate limit estricto para mitigar
// enumeración/scraping de NITs. Listar y crear no tienen consumidor público
// conocido hoy, así que quedan detrás de auth.
router.get('/', auth, controller.listar);
router.get('/:nit', strictRateLimit, controller.buscarPorNit);
router.post('/', auth, validate(createEmpresaSchema), controller.crear);

module.exports = router;
