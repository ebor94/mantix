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

// Campos de archivo aceptados: soporte de pago, cédula frontal y reverso
const uploadFields = upload.fields([
  { name: 'soporte',       maxCount: 1 },
  { name: 'cedulaFrontal', maxCount: 1 },
  { name: 'cedulaReverso', maxCount: 1 }
]);

// POST /afiliados — acepta tanto JSON puro como multipart/form-data
router.post(
  '/',
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.create
);

router.get('/',           controller.getAll);
router.get('/pendientes', controller.getPendientes);
router.get('/rechazados', controller.getRechazados);
router.get('/:id',        controller.getById);

router.post('/:id/aprobar',  controller.aprobar);
router.post('/:id/rechazar', controller.rechazar);

// PUT /:id/reenviar — acepta FormData (con archivos) o JSON puro
router.put(
  '/:id/reenviar',
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.reenviar
);

module.exports = router;
