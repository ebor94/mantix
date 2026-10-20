const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth } = require('../middleware/trkAuth');
const { limitadorPin } = require('../middleware/limitadores');
const aw = require('../utils/aw');
const ctrl = require('../controllers/auth.controller');

const esquemaPin = Joi.object({
  usuario_id: Joi.number().integer().positive().required(),
  pin: Joi.string().pattern(/^\d{6}$/).required()
});

const router = express.Router();
router.post('/pin', apiCodigo('TRK-AUTH-001'), limitadorPin, validar(esquemaPin), aw(ctrl.loginPin));
router.get('/usuarios-pin', apiCodigo('TRK-AUTH-002'), aw(ctrl.usuariosPin));
router.get('/yo', apiCodigo('TRK-AUTH-003'), trkAuth, aw(ctrl.yo));

module.exports = { prefijo: '/auth', router };
