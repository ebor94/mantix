/**
 * sv/routes/agenda.routes.js (migración 018 + 020)
 * Montaje: /api/sv (svAuth aplicado en routes/index.js).
 */
const router = require('express').Router();
const c = require('../controllers/agenda.controller');
const { validate } = require('../middleware/validate');
const v = require('../validations/eventosMulti.validation');

// Agenda unificada
router.get('/agenda/dia',  c.listarDia);
router.get('/agenda/mes',  c.listarMes);

// CRUD eventos
router.get('/eventos-agenda/:id',                    c.obtenerEvento);
router.post('/eventos-agenda',                       validate(v.crearEvento), c.crearEvento);
router.put('/eventos-agenda/:id',                    validate(v.actualizarEvento), c.actualizarEventoV2);
router.patch('/eventos-agenda/:id/completado',       c.marcarCompletadoEvento);
router.delete('/eventos-agenda/:id',                 c.eliminarEvento);

// SP-1a · Pool + métricas + resumen
router.get('/eventos-agenda/:id/pool',                                        c.listarPool);
router.post('/eventos-agenda/:id/pool/:pool_id/asignar',
            validate(v.asignarPool),                                          c.asignarPool);
router.patch('/eventos-agenda/asistentes/:eva_id/metricas',
             validate(v.actualizarMetricas),                                  c.actualizarMetricas);
router.get('/eventos-agenda/:id/resumen',                                     c.resumenEvento);

module.exports = router;
