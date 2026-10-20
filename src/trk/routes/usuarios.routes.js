const express = require('express');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const { ROLES_OPERATIVOS } = require('../config/constantes');
const ctrl = require('../controllers/usuarios.controller');

const esquemaCrear = Joi.object({
  nombre: Joi.string().trim().min(2).max(60).required(),
  rol: Joi.string().valid(...ROLES_OPERATIVOS).required()
});
const esquemaActualizar = Joi.object({
  nombre: Joi.string().trim().min(2).max(60),
  activo: Joi.boolean()
}).min(1);
const esquemaId = Joi.object({ id: Joi.number().integer().positive().required() });

const admin = [trkAuth, trkPermiso('administrar')];
const router = express.Router();
router.get('/', apiCodigo('TRK-USR-001'), ...admin, aw(ctrl.listar));
router.post('/', apiCodigo('TRK-USR-002'), ...admin, validar(esquemaCrear), aw(ctrl.crear));
router.patch('/:id', apiCodigo('TRK-USR-003'), ...admin, validar(esquemaId, 'params'), validar(esquemaActualizar), aw(ctrl.actualizar));
router.post('/:id/pin', apiCodigo('TRK-USR-004'), ...admin, validar(esquemaId, 'params'), aw(ctrl.regenerarPin));

module.exports = { prefijo: '/usuarios', router };
