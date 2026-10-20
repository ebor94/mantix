const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { trkAuth } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/categorias.controller');

const router = express.Router();
router.get('/', apiCodigo('TRK-CAT-005'), trkAuth, aw(ctrl.listar));

module.exports = { prefijo: '/categorias', router };
