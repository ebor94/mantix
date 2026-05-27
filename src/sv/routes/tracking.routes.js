/**
 * sv/routes/tracking.routes.js
 * Fase 7 — Tracking GPS de jornadas.
 *
 * Permisos:
 *  - POST/PATCH/GET de propias jornadas: cualquier usuario logueado
 *  - GET de recorridos ajenos: verificado por controller (puedeVerUsuario)
 *  - liveEquipo: supervisor+ (nivel ≤ 3)
 */
const router = require('express').Router();
const ctrl   = require('../controllers/tracking.controller');
const v      = require('../validations/tracking.validation');
const { validate } = require('../middleware/validate');

// Jornadas propias
router.post  ('/jornadas',                    validate(v.iniciarJornada),                  ctrl.iniciarJornada);
router.patch ('/jornadas/:id/finalizar',      validate(v.finalizarJornada),                ctrl.finalizarJornada);
router.post  ('/jornadas/:id/puntos',         validate(v.batchPuntos),                     ctrl.batchPuntos);
router.get   ('/jornadas',                    validate(v.listarJornadas, 'query'),         ctrl.listarJornadas);

// Recorrido de un usuario en una fecha (propio o subordinado)
router.get   ('/recorrido/:usrId',            validate(v.recorrido, 'query'),              ctrl.recorrido);

// Vista live (supervisor+)
router.get   ('/equipo/live',                 validate(v.liveEquipo, 'query'),             ctrl.liveEquipo);

// Habeas Data
router.post  ('/me/consentimiento',                                                        ctrl.aceptarConsentimiento);
router.get   ('/me/exportar',                 validate(v.exportar, 'query'),               ctrl.exportarMisDatos);

module.exports = router;
