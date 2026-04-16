const { Router } = require('express');
const controller = require('../controllers/afiliado.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { auth, requirePermiso, softAuth } = require('../middleware/auth');
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

// Campos de archivo aceptados: soporte de pago, cédula y documentos por beneficiario
// Se admiten hasta 10 documentos de beneficiarios (beneficiario_doc_0 … beneficiario_doc_9)
const beneficiariosDocFields = Array.from({ length: 10 }, (_, i) => ({
  name: `beneficiario_doc_${i}`,
  maxCount: 1
}))

const uploadFields = upload.fields([
  { name: 'soporte',              maxCount: 1 },
  { name: 'cedulaFrontal',        maxCount: 1 },
  { name: 'cedulaReverso',        maxCount: 1 },
  { name: 'contratoCompetencia',  maxCount: 1 },
  ...beneficiariosDocFields
]);

// ── POST /afiliados/veolia — registro público sin autenticación (Veolia) ───
router.post(
  '/veolia',
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.createPublico
);

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

// ── Rutas OTP consulta pública ─────────────────────────────────────────────
// ⚠️ TODAS las rutas /consulta/* y rutas fijas deben ir ANTES de /:id
router.post('/consulta/solicitar-otp', softAuth, controller.solicitarOtp);
router.post('/consulta/verificar-otp', softAuth, controller.verificarOtp);

// ── GET /afiliados/consulta/:numerodocumento — consulta pública por documento ─
router.get('/consulta/:numerodocumento', softAuth, controller.consultarPorDocumento);

// ── GET /afiliados — acceso ADMIN (super_admin) para ver todos ─────────────
router.get('/', auth, controller.getAll);

// ── GET /afiliados/pendientes — asesor ve propias, aprobador/admin ve todas ─
//    La lógica de filtrado se hace en el servicio según permisos del usuario
router.get('/pendientes', auth, controller.getPendientes);

// ── GET /afiliados/rechazados — ídem ──────────────────────────────────────
router.get('/rechazados', auth, controller.getRechazados);

// ── GET /afiliados/por-hash/:hash — carga pública de afiliación via hash cifrado ─
router.get('/por-hash/:hash', softAuth, controller.getByHash);

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

// ── POST /:id/rechazar-parcial — inactiva beneficiarios; afiliado sigue pendiente
router.post('/:id/rechazar-parcial',
  auth,
  requirePermiso('afiliaciones', 'rechazar'),
  controller.rechazarParcial
);

// ── PUT /:id/actualizar-beneficiarios — actualización pública de beneficiarios ─
router.put('/:id/actualizar-beneficiarios',
  softAuth,
  controller.actualizarBeneficiariosConsulta
);

// ── PUT /:id/datos-contacto — edición de datos de contacto (pública con OTP previo) ─
router.put('/:id/datos-contacto', softAuth, controller.actualizarDatosContacto);

// ── POST /:id/solicitar-otp-reenvio — OTP para confirmar reenvío (público via hash) ─
router.post('/:id/solicitar-otp-reenvio', softAuth, controller.solicitarOtpReenvio);

// ── PUT /:id/reenviar — público via hash cifrado; OTP es el control de acceso ─
router.put(
  '/:id/reenviar',
  softAuth,
  uploadFields,
  parseMultipartJson,
  validate(createAfiliadoSchema),
  controller.reenviar
);

module.exports = router;
