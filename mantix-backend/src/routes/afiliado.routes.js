const { Router } = require('express');
const controller = require('../controllers/afiliado.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { createAfiliadoSchema } = require('../validations/afiliado.validation');

const router = Router();

// Middleware: si la petición viene como multipart/form-data (con archivo),
// el JSON llega en el campo 'data' como string — se parsea y reemplaza req.body
// para que el middleware de validación lo procese normalmente.
function parseMultipartJson(req, res, next) {
  if (req.body && typeof req.body.data === 'string') {
    try {
      req.body = JSON.parse(req.body.data);
    } catch (_) {
      return res.status(400).json({
        success: false,
        message: 'El campo data no contiene un JSON válido'
      });
    }
  }
  next();
}

// POST /afiliados — acepta tanto JSON puro como multipart/form-data (con soporte de pago)
router.post(
  '/',
  upload.single('soporte'),   // procesa el archivo; si no viene, req.file = undefined
  parseMultipartJson,          // convierte req.body.data → req.body cuando aplica
  validate(createAfiliadoSchema),
  controller.create
);

router.get('/',           controller.getAll);
router.get('/pendientes', controller.getPendientes);
router.get('/rechazados', controller.getRechazados);
router.get('/:id',        controller.getById);

router.post('/:id/aprobar',  controller.aprobar);
router.post('/:id/rechazar', controller.rechazar);

// PUT /:id/reenviar — acepta FormData (con nuevo soporte de pago) o JSON puro
router.put(
  '/:id/reenviar',
  upload.single('soporte'),
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.reenviar
);

module.exports = router;
