/**
 * sv/routes/categorizacionEmpresa.routes.js
 * Montaje: /api/sv (debajo de svAuth) — ver routes/index.js.
 */
const router = require('express').Router();
const ctrl = require('../controllers/categorizacionEmpresa.controller');

// Tipos de empresa (categorías) — listar abierto, CRUD admin
router.get('/tipos-empresa',        ctrl.listarTipos);
router.post('/tipos-empresa',       ctrl.crearTipo);
router.put('/tipos-empresa/:id',    ctrl.actualizarTipo);

// Grupos empresariales (ej. Grupo Éxito) — listar y crear al vuelo abierto, editar admin
router.get('/grupos-empresariales',     ctrl.listarGrupos);
router.post('/grupos-empresariales',    ctrl.crearGrupo);
router.put('/grupos-empresariales/:id', ctrl.actualizarGrupo);

module.exports = router;
