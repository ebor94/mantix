const express = require('express');
const Joi = require('joi');
const validar = require('../middleware/validar');
const apiCodigo = require('../middleware/apiCodigo');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/categorias.controller');

const esquemaId = Joi.object({ id: Joi.number().integer().positive().required() });
const esquemaActualizar = Joi.object({ puestos_premiados: Joi.number().integer().min(1).max(20).required() });

const router = express.Router();
router.get('/', apiCodigo('TRK-CAT-005'), trkAuth, aw(ctrl.listar));
router.post('/:id/abrir', apiCodigo('TRK-CAT-001'), trkAuth, trkPermiso('administrar'), validar(esquemaId, 'params'), aw(ctrl.abrir));
router.post('/:id/cerrar', apiCodigo('TRK-CAT-002'), trkAuth, trkPermiso('administrar'), validar(esquemaId, 'params'), aw(ctrl.cerrar));
router.post('/:id/publicar', apiCodigo('TRK-CAT-003'), trkAuth, trkPermiso('publicar'), validar(esquemaId, 'params'), aw(ctrl.publicar));
router.patch('/:id', apiCodigo('TRK-CAT-004'), trkAuth, trkPermiso('administrar'), validar(esquemaId, 'params'), validar(esquemaActualizar), aw(ctrl.actualizar));

module.exports = { prefijo: '/categorias', router };
