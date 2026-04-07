const { Router } = require('express');
const controller = require('../controllers/tarifa.controller');

const router = Router();

// GET /tarifas                    → lista todas las tarifas activas
// GET /tarifas/buscar?canal=&producto=&grupo=&asistenciaFueraDeCasa=
// GET /tarifas/primas?seguro=SOLICANASTA   → primas por tipo de seguro
router.get('/primas', controller.listarPrimas);
router.get('/buscar', controller.buscarTarifa);
router.get('/', controller.listarTarifas);

module.exports = router;
