const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermisoAlguno } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/rubricas.controller');

const router = express.Router();
router.get('/:categoriaId', apiCodigo('TRK-RUB-001'), trkAuth, trkPermisoAlguno('calificar', 'administrar'),
  validar(Joi.object({ categoriaId: Joi.number().integer().positive().required() }), 'params'), aw(ctrl.deCategoria));

module.exports = { prefijo: '/rubricas', router };
