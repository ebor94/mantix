const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkAuthOpcional, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/ranking.controller');

const esquemaCategoria = Joi.object({ categoriaId: Joi.number().integer().positive().required() });
const esquemaVista = Joi.object({ vista: Joi.string().valid('publicado') });
const esquemaDesempate = Joi.object({ orden: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).min(2).unique().required() });

const router = express.Router();
router.get('/:categoriaId', apiCodigo('TRK-RNK-001'), trkAuthOpcional, validar(esquemaCategoria, 'params'), validar(esquemaVista, 'query'), aw(ctrl.obtener));
router.put('/:categoriaId/desempate', apiCodigo('TRK-RNK-002'), trkAuth, trkPermiso('administrar'), validar(esquemaCategoria, 'params'), validar(esquemaDesempate), aw(ctrl.desempate));

module.exports = { prefijo: '/ranking', router };
