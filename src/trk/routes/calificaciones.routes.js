const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/calificaciones.controller');

const esquemaParticipante = Joi.object({ participanteId: Joi.string().guid({ version: 'uuidv4' }).required() });
// Joi solo exige forma; el rango por criterio (R1) lo valida el servicio con los máximos de BD → 422.
const esquemaEnvio = Joi.object({
  puntajes: Joi.array().items(Joi.object({
    criterio_id: Joi.number().integer().positive().required(),
    puntaje: Joi.number().required()
  })).min(1).required()
});

const router = express.Router();
router.put('/:participanteId', apiCodigo('TRK-CAL-002'), trkAuth, trkPermiso('calificar'), validar(esquemaParticipante, 'params'), validar(esquemaEnvio), aw(ctrl.enviar));

module.exports = { prefijo: '/calificaciones', router };
