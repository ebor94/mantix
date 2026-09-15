/**
 * sv/routes/agenda.routes.js (migración 018 + 020)
 * Montaje: /api/sv (svAuth aplicado en routes/index.js).
 */
const router = require('express').Router();
const c = require('../controllers/agenda.controller');
const { validate } = require('../middleware/validate');
const v = require('../validations/eventosMulti.validation');
const { authorize } = require('../middleware/svAuthorize');
const { ROLES_SUPERVISORES } = require('../config/constants');

// Agenda unificada
router.get('/agenda/dia',  c.listarDia);
router.get('/agenda/mes',  c.listarMes);

// SP-2 · Agenda de seguimiento (gated a supervisores)
router.get('/agenda/semana',              authorize(...ROLES_SUPERVISORES), c.semanaSeguimiento);
router.get('/eventos-agenda/listado',     authorize(...ROLES_SUPERVISORES), c.listadoEventos);

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
