// ============================================
// src/routes/certificado.routes.js
// POST /api/certificados/generar — Certificado afiliación exequial PDF
// ============================================

const { Router } = require('express');
const controller = require('../controllers/certificado.controller');
const { auth } = require('../middleware/auth');

const router = Router();

// POST /api/certificados/generar
// Body:     { afiliadoId: number }
// Response: PDF binario (application/pdf, Content-Disposition: attachment)
router.post('/generar', auth, controller.generar);

module.exports = router;
