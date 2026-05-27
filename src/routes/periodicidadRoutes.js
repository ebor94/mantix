// ============================================
// src/routes/periodicidadRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const periodicidadController = require('../controllers/periodicidadController');

/**
 * @swagger
 * components:
 *   schemas:
 *     PeriodicidadInput:
 *       type: object
 *       required:
 *         - nombre
 *         - dias
 *       properties:
 *         nombre:
 *           type: string
 *           maxLength: 50
 *           example: "Mensual"
 *         dias:
 *           type: integer
 *           minimum: 1
 *           example: 30
 *         descripcion:
 *           type: string
 *           example: "Cada mes"
 */

/**
 * @swagger
 * tags:
 *   name: Periodicidades
 *   description: API para gestión de periodicidades de mantenimiento
 */

/**
 * @swagger
 * /api/periodicidades:
 *   get:
 *     summary: Obtener todas las periodicidades
 *     tags: [Periodicidades]
 *     responses:
 *       200:
 *         description: Lista de periodicidades obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Periodicidad'
 *       500:
 *         description: Error del servidor
 */
router.get('/', periodicidadController.obtenerTodas);

/**
 * @swagger
 * /api/periodicidades/{id}:
 *   get:
 *     summary: Obtener una periodicidad por ID
 *     tags: [Periodicidades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la periodicidad
 *         example: 1
 *     responses:
 *       200:
 *         description: Periodicidad encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Periodicidad'
 *       404:
 *         description: Periodicidad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', periodicidadController.obtenerPorId);

/**
 * @swagger
 * /api/periodicidades:
 *   post:
 *     summary: Crear una nueva periodicidad
 *     tags: [Periodicidades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PeriodicidadInput'
 *           examples:
 *             mensual:
 *               summary: Periodicidad Mensual
 *               value:
 *                 nombre: "Mensual"
 *                 dias: 30
 *                 descripcion: "Cada mes"
 *             trimestral:
 *               summary: Periodicidad Trimestral
 *               value:
 *                 nombre: "Trimestral"
 *                 dias: 90
 *                 descripcion: "Cada 3 meses"
 *     responses:
 *       201:
 *         description: Periodicidad creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Periodicidad creada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/Periodicidad'
 *       400:
 *         description: Datos inválidos o periodicidad duplicada
 *       500:
 *         description: Error del servidor
 */
router.post('/', periodicidadController.crear);

/**
 * @swagger
 * /api/periodicidades/{id}:
 *   put:
 *     summary: Actualizar una periodicidad
 *     tags: [Periodicidades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la periodicidad a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PeriodicidadInput'
 *           example:
 *             nombre: "Bimensual"
 *             dias: 60
 *             descripcion: "Cada 2 meses"
 *     responses:
 *       200:
 *         description: Periodicidad actualizada exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Periodicidad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', periodicidadController.actualizar);

/**
 * @swagger
 * /api/periodicidades/{id}:
 *   delete:
 *     summary: Eliminar una periodicidad
 *     tags: [Periodicidades]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la periodicidad a eliminar
 *         example: 1
 *     responses:
 *       200:
 *         description: Periodicidad eliminada exitosamente
 *       404:
 *         description: Periodicidad no encontrada
 *       409:
 *         description: No se puede eliminar porque tiene actividades asociadas
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', periodicidadController.eliminar);

module.exports = router;