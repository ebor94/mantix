const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { auth, authorize } = require('../middleware/auth');

const cymPredioController       = require('../controllers/cymPredioController');
const cymContratoController     = require('../controllers/cymContratoController');
const cymAsignacionController   = require('../controllers/cymAsignacionController');
const cymMantenimientoController= require('../controllers/cymMantenimientoController');
const cymCarteraController      = require('../controllers/cymCarteraController');
const cymReporteController      = require('../controllers/cymReporteController');
const cymParejaController       = require('../controllers/cymParejaController');

// Upload de evidencias fotográficas en uploads/cym/
const uploadDir = path.join(process.env.UPLOAD_PATH || './uploads', 'cym');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `cym_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const uploadCym = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const valid   = allowed.test(path.extname(file.originalname).toLowerCase())
                 && allowed.test(file.mimetype);
    cb(valid ? null : new Error('Solo se permiten imágenes JPG, PNG o WEBP'), valid);
  }
});

// Todos los roles CYM que acceden al sistema
const ROLES_CYM = ['coordinador_cym','supervisor_cym','auxiliar_cartera_cym'];
const COORD     = ['coordinador_cym'];

// ----------------------------------------------------------------
// PREDIOS
// ----------------------------------------------------------------
router.get('/predios',
  auth, authorize(...ROLES_CYM),
  cymPredioController.getAll
);
router.get('/predios/:id',
  auth, authorize(...ROLES_CYM),
  cymPredioController.getById
);
router.get('/predios/:id/timeline',
  auth, authorize(...ROLES_CYM),
  cymPredioController.getTimeline
);
router.get('/predios/:id/historico-sq',
  auth, authorize(...ROLES_CYM),
  cymPredioController.getHistoricoSq
);
router.post('/predios',
  auth, authorize(...COORD),
  cymPredioController.create
);
router.put('/predios/:id',
  auth, authorize(...COORD),
  cymPredioController.update
);
router.put('/predios/:id/inactivar',
  auth, authorize(...COORD),
  cymPredioController.inactivar
);

// ----------------------------------------------------------------
// CONTRATOS
// ----------------------------------------------------------------
router.get('/contratos/predio/:predioId',
  auth, authorize(...ROLES_CYM),
  cymContratoController.getByPredio
);
router.post('/contratos',
  auth, authorize(...COORD),
  cymContratoController.crear
);
router.put('/contratos/:id',
  auth, authorize(...COORD),
  cymContratoController.update
);
router.put('/contratos/:id/cancelar',
  auth, authorize(...COORD),
  cymContratoController.cancelar
);

// ----------------------------------------------------------------
// PAREJAS DE OPERARIOS
// ----------------------------------------------------------------
router.get('/parejas',
  auth, authorize(...ROLES_CYM),
  cymParejaController.getAll
);
router.get('/parejas/operarios',
  auth, authorize(...COORD),
  cymParejaController.getOperarios
);
router.post('/parejas/operarios',
  auth, authorize(...COORD),
  cymParejaController.crearOperario
);
router.post('/parejas',
  auth, authorize(...COORD),
  cymParejaController.crear
);
router.put('/parejas/:id',
  auth, authorize(...COORD),
  cymParejaController.actualizar
);
router.put('/parejas/:id/miembro',
  auth, authorize(...COORD),
  cymParejaController.cambiarMiembro
);
router.get('/parejas/:id/historial',
  auth, authorize(...COORD),
  cymParejaController.getHistorialMiembros
);

// ----------------------------------------------------------------
// ASIGNACIONES
// ----------------------------------------------------------------
router.get('/asignaciones/predio/:predioId',
  auth, authorize(...ROLES_CYM),
  cymAsignacionController.getByPredio
);
router.get('/asignaciones/personal-disponible',
  auth, authorize(...COORD),
  cymAsignacionController.getPersonalDisponible
);
router.post('/asignaciones',
  auth, authorize(...COORD),
  cymAsignacionController.asignar
);

// ----------------------------------------------------------------
// MANTENIMIENTOS
// ----------------------------------------------------------------
router.get('/mantenimientos/asignados',
  auth, authorize('supervisor_cym'),
  cymMantenimientoController.getAsignados
);
router.get('/mantenimientos/:id',
  auth, authorize('supervisor_cym','coordinador_cym'),
  cymMantenimientoController.getById
);
router.post('/mantenimientos',
  auth, authorize('supervisor_cym'),
  cymMantenimientoController.crear
);
router.put('/mantenimientos/:id/checklist',
  auth, authorize('supervisor_cym'),
  cymMantenimientoController.completarChecklist
);
router.put('/mantenimientos/:id/completar',
  auth, authorize('supervisor_cym'),
  cymMantenimientoController.completar
);
router.post('/mantenimientos/:id/evidencias',
  auth, authorize('supervisor_cym'),
  uploadCym.array('evidencias', 10),
  cymMantenimientoController.subirEvidencias
);

// ----------------------------------------------------------------
// CARTERA
// ----------------------------------------------------------------
router.get('/cartera/contratos',
  auth, authorize('auxiliar_cartera_cym','coordinador_cym'),
  cymCarteraController.getContratos
);
router.get('/cartera/historial/:contratoId',
  auth, authorize('auxiliar_cartera_cym','coordinador_cym'),
  cymCarteraController.getHistorial
);
router.post('/cartera/gestiones',
  auth, authorize('auxiliar_cartera_cym'),
  cymCarteraController.registrarGestion
);

// ----------------------------------------------------------------
// REPORTES Y DASHBOARD
// ----------------------------------------------------------------
router.get('/reportes/dashboard',
  auth, authorize(...ROLES_CYM),
  cymReporteController.dashboard
);
router.get('/reportes/timeline/:predioId',
  auth, authorize(...ROLES_CYM),
  cymReporteController.timeline
);

module.exports = router;
