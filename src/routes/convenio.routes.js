const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/convenio.controller');
const { auth, requirePermiso } = require('../middleware/auth');
const { invitacionRateLimit } = require('../middleware/strictRateLimit');

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

// ── GET /convenios/invitacion/:token — resuelve una invitación de nómina ───
// Público (Task 4): el link de autoafiliación llega por WhatsApp/email sin
// sesión. Rate limiter propio del flujo de invitaciones
// (invitacionRateLimit, src/middleware/strictRateLimit.js) en vez del
// limitePublico de arriba: a diferencia de /publico/:slug (un slug
// adivinable, pensado para difundirse), acá el token es una capacidad de un
// solo uso — más valioso para un atacante de fuerza bruta, así que el
// límite es más severo que limitePublico.
//
// Fix 4 (ronda de revisión): NO se reusa `strictRateLimit` (10 req/15min,
// el mismo budget de login/OTP) — este flujo está pensado para uso masivo
// desde una sola IP corporativa (muchos empleados de la misma oficina
// resolviendo su invitación en la misma ventana de tiempo), y compartir el
// budget estricto bloquearía login/OTP de esa misma IP tras solo unos pocos
// empleados. `invitacionRateLimit` es una instancia separada, calibrada
// para ese volumen, pero igual de real (ver el comentario del middleware).
//
// ⚠️ Nombre de segmento en singular ("invitacion") a propósito, distinto del
// plural ("invitaciones") de las rutas internas de abajo — evita cualquier
// ambigüedad de matching entre esta ruta pública y /:slug/invitaciones.
router.get('/invitacion/:token', invitacionRateLimit, controller.resolverInvitacion);

// ── Internas ────────────────────────────────────────────────────────────────
// Listado para el selector de convenio y el filtro de aprobaciones.
router.get('/', auth, controller.listar);

// ── Nómina / invitaciones de un convenio (Task 4) ──────────────────────────
// RBAC vía requirePermiso('empresa', ...) — permisos sembrados para el rol
// EMPRESA_RRHH en convenio_nomina_migration.sql. El scope por convenio (un
// usuario con empresa_id solo puede operar el convenio de su propia empresa)
// se valida dentro del controlador, no acá: responde 404, no 403, en caso de
// no coincidir (ver convenio.controller.resolverConvenioOperable).
router.get(
  '/:slug/empleados',
  auth,
  requirePermiso('empresa', 'ver'),
  controller.getEmpleados
);
router.post(
  '/:slug/empleados/importar',
  auth,
  requirePermiso('empresa', 'gestionar_empleados'),
  controller.importarEmpleados
);
router.post(
  '/:slug/invitaciones',
  auth,
  requirePermiso('empresa', 'invitar'),
  controller.crearInvitaciones
);
router.post(
  '/:slug/invitaciones/enviar',
  auth,
  requirePermiso('empresa', 'invitar'),
  controller.enviarInvitaciones
);
router.get(
  '/:slug/invitaciones',
  auth,
  requirePermiso('empresa', 'ver'),
  controller.getInvitaciones
);

module.exports = router;
