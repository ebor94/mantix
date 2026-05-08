// ============================================
// r44Routes.js — Módulo Portal de Proveedores R-44
// Todas las rutas tienen el prefijo /api/r44/
// No colisiona con ninguna ruta existente de Mantix
// ============================================
const express  = require('express');
const router   = express.Router();

const { r44Auth, r44Authorize }     = require('../middleware/r44Auth');
const uploadR44                      = require('../middleware/multerR44');
const r44AuthCtrl                    = require('../controllers/r44AuthController');
const r44DocCtrl                     = require('../controllers/r44DocumentosController');
const r44ProvCtrl                    = require('../controllers/r44ProveedorController');
const r44RevCtrl                     = require('../controllers/r44RevisionController');

// ── AUTENTICACIÓN ─────────────────────────────────────────
// POST /api/r44/auth/login     — Login proveedor/revisor
// POST /api/r44/auth/registro  — Registro de nuevo proveedor
// POST /api/r44/auth/logout    — Logout (stateless)
router.post('/auth/login',    r44AuthCtrl.login);
router.post('/auth/registro', r44AuthCtrl.registro);
router.post('/auth/logout',   r44Auth, r44AuthCtrl.logout);

// ── DOCUMENTOS ────────────────────────────────────────────
// POST /api/r44/documentos/:proveedor_id — Subir 4 documentos + notificar n8n
// GET  /api/r44/extraccion/estado/:proveedor_id — Polling de estado
// POST /api/r44/extraccion/resultado — Callback de n8n (sin auth)
router.post('/documentos/:proveedor_id', r44Auth, uploadR44, r44DocCtrl.subirDocumentos);
router.get('/extraccion/estado/:proveedor_id', r44Auth, r44DocCtrl.estadoExtraccion);
router.post('/extraccion/resultado', r44DocCtrl.recibirResultado); // llamado por n8n (IP interna)

// ── FORMULARIO PROVEEDOR ──────────────────────────────────
// POST /api/r44/proveedores     — Crear / enviar formulario R-44
// GET  /api/r44/proveedores/mio — Formulario del proveedor autenticado
// GET  /api/r44/proveedores/:id — Detalle (revisores/admin)
router.post('/proveedores',     r44Auth, r44ProvCtrl.crear);
router.get('/proveedores/mio',  r44Auth, r44ProvCtrl.miFormulario);
router.get('/proveedores/:id',  r44Auth, r44Authorize('revisor_compras','revisor_excelencia','admin'), r44ProvCtrl.getById);

// ── DASHBOARD REVISORES ───────────────────────────────────
// GET   /api/r44/revisores/proveedores         — Lista paginada
// GET   /api/r44/revisores/proveedores/:id     — Detalle
// PATCH /api/r44/revisores/proveedores/:id/estado — Aprobar/rechazar
// GET   /api/r44/revisores/estadisticas        — Resumen ejecutivo
const REVISORES = ['revisor_compras', 'revisor_excelencia', 'admin'];
router.get('/revisores/proveedores',
  r44Auth, r44Authorize(...REVISORES), r44RevCtrl.listar);

router.get('/revisores/proveedores/:id',
  r44Auth, r44Authorize(...REVISORES), r44RevCtrl.detalle);

router.patch('/revisores/proveedores/:id/estado',
  r44Auth, r44Authorize(...REVISORES), r44RevCtrl.actualizarEstado);

router.get('/revisores/estadisticas',
  r44Auth, r44Authorize(...REVISORES), r44RevCtrl.estadisticas);

module.exports = router;
