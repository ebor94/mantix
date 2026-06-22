/**
 * sv/routes/agenda.routes.js  (migración 018)
 * Montaje: /api/sv (svAuth aplicado en routes/index.js).
 */
const router = require('express').Router();
const c = require('../controllers/agenda.controller');

// Agenda unificada
router.get('/agenda/dia',  c.listarDia);   // ?fecha=YYYY-MM-DD&asesor_id=
router.get('/agenda/mes',  c.listarMes);   // ?anio=&mes=&asesor_id=

// CRUD eventos
router.get('/eventos-agenda/:id',                    c.obtenerEvento);
router.post('/eventos-agenda',                       c.crearEvento);
router.put('/eventos-agenda/:id',                    c.actualizarEvento);
router.patch('/eventos-agenda/:id/completado',       c.marcarCompletadoEvento);
router.delete('/eventos-agenda/:id',                 c.eliminarEvento);

module.exports = router;
