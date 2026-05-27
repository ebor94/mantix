// ============================================
// src/routes/votaciones.routes.js
// Sistema de Votaciones en Línea - Serfunorte
// ============================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const controller = require('../controllers/votacionesController');
const { auth } = require('../middleware/auth');

// ─── Multer: subida de fotos de candidatos ───────────────────────
const uploadDir = path.join(__dirname, '../../uploads/votaciones');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `candidato_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
  },
});

// ─── Middleware JWT de votación ───────────────────────────────────
const authVotacion = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token de votación requerido' });
  }
  try {
    const secret = process.env.VOTACION_JWT_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);
    if (decoded.tipo !== 'votacion') throw new Error('Token no válido para votación');
    req.votacion = decoded; // { votante_id, evento_id, sede_id, cedula }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token de votación inválido o expirado' });
  }
};

// ─────────────────────────────────────────────
// RUTAS PÚBLICAS — Flujo del votante
// ─────────────────────────────────────────────

/** GET /api/votaciones/eventos-activos — Lista eventos activos (PÚBLICO, sin auth) */
router.get('/eventos-activos', controller.getEventosActivos);

/** POST /api/votaciones/iniciar — Ingresar cédula y solicitar OTP */
router.post('/iniciar', controller.iniciarSesion);

/** POST /api/votaciones/verificar-token — Validar OTP y obtener JWT votación */
router.post('/verificar-token', controller.verificarToken);

/** GET /api/votaciones/candidatos — Listar candidatos de la sede (JWT votación) */
router.get('/candidatos', authVotacion, controller.getCandidatosVotante);

/** POST /api/votaciones/votar — Emitir voto (JWT votación) */
router.post('/votar', authVotacion, controller.emitirVoto);

// ─────────────────────────────────────────────
// RUTAS ADMIN — Requieren JWT Mantix
// ─────────────────────────────────────────────
router.use('/admin', auth);

// Eventos
router.get('/admin/eventos', controller.getEventos);
router.get('/admin/eventos/:id', controller.getEventoById);
router.post('/admin/eventos', controller.crearEvento);
router.put('/admin/eventos/:id', controller.actualizarEvento);
router.delete('/admin/eventos/:id', controller.eliminarEvento);

// Votantes
router.get('/admin/votantes', controller.getVotantes);
router.post('/admin/votantes', controller.crearVotante);
router.put('/admin/votantes/:id', controller.actualizarVotante);
router.delete('/admin/votantes/:id', controller.eliminarVotante);
router.post('/admin/votantes/importar', controller.importarVotantes);

// Candidatos
router.get('/admin/candidatos', controller.getCandidatosAdmin);
router.post('/admin/candidatos', upload.single('foto'), controller.crearCandidato);
router.put('/admin/candidatos/:id', upload.single('foto'), controller.actualizarCandidato);
router.delete('/admin/candidatos/:id', controller.eliminarCandidato);

// Resultados y estadísticas
router.get('/admin/resultados/:evento_id', controller.getResultadosPorSede);
router.get('/admin/estadisticas/:evento_id', controller.getEstadisticas);

module.exports = router;
