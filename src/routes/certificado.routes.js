// ============================================
// src/routes/certificado.routes.js
// POST /api/certificados/generar — Certificado afiliación exequial PDF
// ============================================

const { Router } = require('express');
const controller = require('../controllers/certificado.controller');
const { auth } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Certificados
 *     description: Generación de certificados PDF de afiliación exequial
 */

/**
 * @swagger
 * /api/certificados/generar:
 *   post:
 *     tags: [Certificados]
 *     summary: Generar certificado de afiliación exequial en PDF
 *     description: |
 *       Genera y devuelve como descarga un certificado de afiliación exequial
 *       en formato PDF (A4) para el afiliado indicado. Incluye datos del
 *       contratante/titular, beneficiarios activos, detalle de costos anuales
 *       (Plan, beneficiarios adicionales, asistencia, seguros con prima y
 *       monto asegurado) y firmas.
 *
 *       **Importante:** la respuesta es binaria (`application/pdf`), no JSON.
 *       En Swagger UI, al hacer "Execute" se ofrece como descarga.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - afiliadoId
 *             properties:
 *               afiliadoId:
 *                 type: integer
 *                 description: ID del afiliado en la tabla `afiliados`
 *                 example: 48
 *     responses:
 *       '200':
 *         description: PDF generado correctamente
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *             description: 'attachment; filename="certificado_<numeroDocumento>_<timestamp>.pdf"'
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Falta el parámetro `afiliadoId`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "afiliadoId es requerido"
 *       '401':
 *         description: Token JWT faltante o inválido
 *       '404':
 *         description: Afiliado no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Afiliado 999999 no encontrado"
 *       '500':
 *         description: Error interno generando el PDF
 */
router.post('/generar', auth, controller.generar);

module.exports = router;
