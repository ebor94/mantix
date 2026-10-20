const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/evento.controller');

const esquemaPantalla = Joi.object({
  modo: Joi.string().valid('PASARELA', 'RANKING').required(),
  categoria_id: Joi.number().integer().positive().when('modo', { is: 'RANKING', then: Joi.required(), otherwise: Joi.optional().allow(null) })
});

const router = express.Router();
router.get('/estado', apiCodigo('TRK-EVT-001'), aw(ctrl.estado));
router.put('/pantalla', apiCodigo('TRK-EVT-002'), trkAuth, trkPermiso('administrar'), validar(esquemaPantalla), aw(ctrl.pantalla));
router.get('/tablero', apiCodigo('TRK-EVT-003'), trkAuth, trkPermiso('administrar'), aw(ctrl.tablero));

module.exports = { prefijo: '/evento', router };
