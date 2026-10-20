const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const { ESTADOS } = require('../config/constantes');
const ctrl = require('../controllers/participantes.controller');

const esquemaListado = Joi.object({
  categoria: Joi.number().integer().positive(),
  estado: Joi.string().valid(...Object.values(ESTADOS)),
  q: Joi.string().trim().max(100).allow('')
});
const esquemaId = Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() });

const router = express.Router();
router.get('/', apiCodigo('TRK-PAR-001'), trkAuth, validar(esquemaListado, 'query'), aw(ctrl.listar));
router.get('/:id', apiCodigo('TRK-PAR-002'), trkAuth, validar(esquemaId, 'params'), aw(ctrl.obtener));

module.exports = { prefijo: '/participantes', router, esquemaId };
