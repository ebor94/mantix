const { Router } = require('express');
const controller = require('../controllers/empresa.controller');
const validate = require('../middleware/validate');
const { createEmpresaSchema } = require('../validations/afiliado.validation');

const router = Router();

router.get('/', controller.listar);
router.get('/:nit', controller.buscarPorNit);
router.post('/', validate(createEmpresaSchema), controller.crear);

module.exports = router;
