const { Router } = require('express');
const controller = require('../controllers/afiliado.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { auth, requirePermiso } = require('../middleware/auth');
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

// ── POST /afiliados — solo ASESOR_AFILIACIONES y ADMIN pueden crear ────────
router.post(
  '/',
  auth,
  requirePermiso('afiliaciones', 'crear'),
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.create
);

// ── GET /afiliados — acceso ADMIN (super_admin) para ver todos ─────────────
router.get('/', auth, controller.getAll);

// ── GET /afiliados/pendientes — asesor ve propias, aprobador/admin ve todas ─
//    La lógica de filtrado se hace en el servicio según permisos del usuario
router.get('/pendientes', auth, controller.getPendientes);

// ── GET /afiliados/rechazados — ídem ──────────────────────────────────────
router.get('/rechazados', auth, controller.getRechazados);

// ── GET /afiliados/:id — autenticado; el servicio/controller valida pertenencia
router.get('/:id', auth, controller.getById);

// ── POST /:id/aprobar — solo APROBADOR_AFILIACIONES y ADMIN ───────────────
router.post('/:id/aprobar',
  auth,
  requirePermiso('afiliaciones', 'aprobar'),
  controller.aprobar
);

// ── POST /:id/rechazar — solo APROBADOR_AFILIACIONES y ADMIN ──────────────
router.post('/:id/rechazar',
  auth,
  requirePermiso('afiliaciones', 'rechazar'),
  controller.rechazar
);

// ── PUT /:id/reenviar — solo el asesor dueño o admin (validación en service) ─
router.put(
  '/:id/reenviar',
  auth,
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.reenviar
);

module.exports = router;
