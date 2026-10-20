const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const ctrl = require('../controllers/export.controller');

const router = express.Router();
router.get('/resultados.xlsx', apiCodigo('TRK-EXP-001'), trkAuth, trkPermiso('exportar'), aw(ctrl.resultados));

module.exports = { prefijo: '/export', router };
