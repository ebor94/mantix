// ============================================
// src/routes/reciboCaja.routes.js
// Rutas del módulo de recibos de caja, montadas bajo /api/recibos.
// ============================================
const { Router } = require('express');
const controller = require('../controllers/reciboCaja.controller');
const { auth, requirePermiso } = require('../middleware/auth');

const router = Router();

// ── Asesor: sus propios recibos ──────────────────────────────────
router.get('/mios',
  auth,
  requirePermiso('caja', 'ver_propios'),
  controller.getMisRecibos
);

// ── Asesor: afiliaciones con posfechado pendiente de cobro ───────
router.get('/posfechados-pendientes',
  auth,
  requirePermiso('caja', 'cobrar_posfechado'),
  controller.getPosfechadosPendientes
);

// ── Asesor: marcar un posfechado como cobrado ────────────────────
router.post('/cobrar-posfechado/:afiliadoId',
  auth,
  requirePermiso('caja', 'cobrar_posfechado'),
  controller.cobrarPosfechado
);

// ── Cajero: ver el cuadre de caja con filtros ────────────────────
router.get('/cuadre',
  auth,
  requirePermiso('caja', 'ver_cuadre'),
  controller.getCuadre
);

// ── Cajero: aprobar recibos seleccionados ────────────────────────
router.post('/aprobar',
  auth,
  // El servicio valida internamente el permiso fino por forma de pago:
  //   EFECTIVO              → requiere caja.aprobar_efectivo (rol CAJERO)
  //   TRANSFERENCIA/...     → requiere caja.aprobar_bancarios (rol CARTERA)
  // Por eso aqui solo se exige autenticacion + ver_cuadre.
  requirePermiso('caja', 'ver_cuadre'),
  controller.aprobarRecibos
);

// ── Detalle de recibo (acceso validado dentro del servicio) ──────
router.get('/:id', auth, controller.getReciboById);

// ── Descarga del PDF (acceso validado dentro del servicio) ───────
router.get('/:id/pdf', auth, controller.descargarPDF);

module.exports = router;
