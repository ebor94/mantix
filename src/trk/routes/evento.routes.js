const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const aw = require('../utils/aw');
const ctrl = require('../controllers/evento.controller');

const router = express.Router();
router.get('/estado', apiCodigo('TRK-EVT-001'), aw(ctrl.estado));

module.exports = { prefijo: '/evento', router };
