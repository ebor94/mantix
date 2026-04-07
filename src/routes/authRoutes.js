// ============================================
// src/routes/authRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     description: Permite a un usuario autenticarse en el sistema proporcionando su email y contraseña.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "bortega"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Admin123!"
 *     responses:
 *       '200':
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 usuario:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     nombre:
 *                       type: string
 *                       example: "Bryan"
 *                     apellido:
 *                       type: string
 *                       example: "Ortega"
 *                     email:
 *                       type: string
 *                       example: "bortega"
 *                     rol:
 *                       type: object
 *                       properties:
 *                         nombre:
 *                           type: string
 *                           example: "Administrador"
 *       '400':
 *         description: Datos de entrada inválidos
 *       '401':
 *         description: Credenciales incorrectas
 *       '500':
 *         description: Error interno del servidor
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener perfil del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil del usuario
 */
router.get('/profile', auth, authController.getProfile);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Cambiar contraseña
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contraseña actualizada
 */
router.post('/change-password', auth, authController.changePassword);

module.exports = router;