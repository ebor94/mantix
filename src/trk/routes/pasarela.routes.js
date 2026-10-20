const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const { esquemaId } = require('./participantes.routes');
const ctrl = require('../controllers/pasarela.controller');

const esquemaOrden = Joi.object({
  categoria_id: Joi.number().integer().positive().required(),
  orden: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).min(1).unique().required()
});

const router = express.Router();
// '/orden' antes de '/:id' para que Express no lo tome como id
router.put('/orden', apiCodigo('TRK-PAS-002'), trkAuth, trkPermiso('pasarela'), validar(esquemaOrden), aw(ctrl.reordenar));
router.post('/:id', apiCodigo('TRK-PAS-001'), trkAuth, trkPermiso('pasarela'), validar(esquemaId, 'params'), aw(ctrl.llamar));

module.exports = { prefijo: '/pasarela', router };
