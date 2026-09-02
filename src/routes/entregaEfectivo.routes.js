const { Router } = require('express');
const controller = require('../controllers/entregaEfectivo.controller');
const { auth, requirePermiso } = require('../middleware/auth');
const { strictRateLimit } = require('../middleware/strictRateLimit');

const router = Router();

// Listado: cajero/admin ven todas; asesor (ver_propios) ve solo las suyas.
// Se permite el acceso con cualquiera de los dos permisos; el controller filtra.
router.get('/', auth, controller.requireVerEntregas, controller.listar);

// Dropdown de asesores (solo quien puede registrar).
router.get('/asesores', auth, requirePermiso('caja', 'ver_cuadre'), controller.asesores);

// Comprobante PDF (el controller valida ownership/rol).
router.get('/:id/comprobante-pdf', auth, controller.requireVerEntregas, controller.comprobantePdf);

// Registrar entrega (cajero/admin).
router.post('/', auth, requirePermiso('caja', 'ver_cuadre'), controller.crear);

// Confirmar con OTP (cajero/admin, rate-limited para evitar fuerza bruta del código).
router.post('/:id/confirmar', strictRateLimit, auth, requirePermiso('caja', 'ver_cuadre'), controller.confirmar);

// Reenviar OTP (cajero/admin, rate-limited).
router.post('/:id/reenviar', strictRateLimit, auth, requirePermiso('caja', 'ver_cuadre'), controller.reenviar);

module.exports = router;
