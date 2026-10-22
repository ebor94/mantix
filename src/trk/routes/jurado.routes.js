const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/matriz.controller');

const esquemaMatriz = Joi.object({ categoria: Joi.number().integer().positive() });

const router = express.Router();
router.get('/matriz', apiCodigo('TRK-CAL-004'), trkAuth, trkPermiso('calificar'), validar(esquemaMatriz, 'query'), aw(ctrl.matriz));

module.exports = { prefijo: '/jurado', router };
