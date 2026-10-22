const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/matriz.controller');

const esquemaParticipante = Joi.object({ participanteId: Joi.string().guid({ version: 'uuidv4' }).required() });
// Parcial: cualquier subconjunto de criterios; null vacía la casilla. El rango 0..máx lo valida el servicio → 422.
const esquemaBorrador = Joi.object({
  puntajes: Joi.array().items(Joi.object({
    criterio_id: Joi.number().integer().positive().required(),
    puntaje: Joi.number().allow(null).required()
  })).min(1).required()
});

const router = express.Router();
router.put('/:participanteId', apiCodigo('TRK-CAL-005'), trkAuth, trkPermiso('calificar'), validar(esquemaParticipante, 'params'), validar(esquemaBorrador), aw(ctrl.guardarBorrador));

module.exports = { prefijo: '/borradores', router };
