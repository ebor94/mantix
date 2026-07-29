const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/convenio.controller');
const { auth } = require('../middleware/auth');

const router = Router();

/**
 * Limitador propio para los endpoints públicos de convenios.
 *
 * El limitador global de app.js es de 1000 peticiones cada 15 min por IP para
 * todo /api, que es demasiado holgado para superficies sin autenticación: el
 * GET revela qué convenios existen y el POST de validación ejecuta el motor de
 * reglas en cada llamada.
 */
const limitePublico = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.'
  }
});

// ── Públicas (sin sesión) ───────────────────────────────────────────────────
// Configuración del formulario del convenio.
router.get('/publico/:slug', limitePublico, controller.getPublico);

// Dry-run del motor de reglas: valida un grupo familiar sin persistir nada.
router.post('/publico/:slug/validar', limitePublico, controller.validarPublico);

// ── Internas ────────────────────────────────────────────────────────────────
// Listado para el selector de convenio y el filtro de aprobaciones.
router.get('/', auth, controller.listar);

module.exports = router;
