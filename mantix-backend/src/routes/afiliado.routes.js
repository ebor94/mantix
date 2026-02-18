const { Router } = require('express');
const controller = require('../controllers/afiliado.controller');
const validate = require('../middleware/validate'); 
const { createAfiliadoSchema } = require('../validations/afiliado.validation');

const router = Router();

router.post('/', validate(createAfiliadoSchema), controller.create);
router.get('/', controller.getAll);
router.get('/pendientes', controller.getPendientes);
router.get('/:id', controller.getById);
router.post('/:id/aprobar', controller.aprobar);    
module.exports = router;
