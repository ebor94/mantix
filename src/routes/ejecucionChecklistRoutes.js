// ============================================
// src/routes/ejecucionChecklistRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const ejecucionChecklistController = require('../controllers/ejecucionChecklistController');

/**
 * @swagger
 * components:
 *   schemas:
 *     ChecklistInput:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - actividad
 *       properties:
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         actividad:
 *           type: string
 *           maxLength: 200
 *           description: Descripción de la actividad
 *           example: "Revisar nivel de aceite"
 *         completada:
 *           type: boolean
 *           description: Si está completada
 *           example: true
 *         observacion:
 *           type: string
 *           description: Observaciones
 *           example: "Nivel bajo, se agregó 1 litro"
 *         orden:
 *           type: integer
 *           description: Orden de ejecución
 *           example: 1
 *     
 *     ChecklistMultipleInput:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - items
 *       properties:
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           example: 1
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               actividad:
 *                 type: string
 *                 example: "Revisar nivel de aceite"
 *               completada:
 *                 type: boolean
 *                 example: false
 *               observacion:
 *                 type: string
 *                 example: ""
 *               orden:
 *                 type: integer
 *                 example: 1
 */

/**
 * @swagger
 * tags:
 *   name: Ejecución Checklist
 *   description: API para gestión de checklist de mantenimientos ejecutados
 */

/**
 * @swagger
 * /api/ejecucion-checklist/mantenimiento/{mantenimiento_ejecutado_id}:
 *   get:
 *     summary: Obtener checklist de un mantenimiento ejecutado
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: mantenimiento_ejecutado_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento ejecutado
 *         example: 1
 *     responses:
 *       200:
 *         description: Checklist obtenido exitosamente
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
 *                     $ref: '#/components/schemas/EjecucionChecklist'
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimiento_ejecutado_id', ejecucionChecklistController.obtenerPorMantenimiento);

/**
 * @swagger
 * /api/ejecucion-checklist/{id}:
 *   get:
 *     summary: Obtener un item de checklist por ID
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item
 *         example: 1
 *     responses:
 *       200:
 *         description: Item encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionChecklist'
 *       404:
 *         description: Item no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', ejecucionChecklistController.obtenerPorId);

/**
 * @swagger
 * /api/ejecucion-checklist:
 *   post:
 *     summary: Crear un item de checklist
 *     tags: [Ejecución Checklist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChecklistInput'
 *           example:
 *             mantenimiento_ejecutado_id: 1
 *             actividad: "Revisar nivel de aceite"
 *             completada: false
 *             observacion: ""
 *             orden: 1
 *     responses:
 *       201:
 *         description: Item creado exitosamente
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
 *                   example: "Item de checklist creado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionChecklist'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Mantenimiento no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/', ejecucionChecklistController.crear);

/**
 * @swagger
 * /api/ejecucion-checklist/multiple:
 *   post:
 *     summary: Crear múltiples items de checklist
 *     tags: [Ejecución Checklist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChecklistMultipleInput'
 *           example:
 *             mantenimiento_ejecutado_id: 1
 *             items:
 *               - actividad: "Revisar nivel de aceite"
 *                 completada: false
 *                 orden: 1
 *               - actividad: "Verificar filtros"
 *                 completada: false
 *                 orden: 2
 *               - actividad: "Lubricar componentes"
 *                 completada: false
 *                 orden: 3
 *     responses:
 *       201:
 *         description: Items creados exitosamente
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
 *                   example: "3 items de checklist creados exitosamente"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EjecucionChecklist'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Mantenimiento no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/multiple', ejecucionChecklistController.crearMultiples);

/**
 * @swagger
 * /api/ejecucion-checklist/{id}:
 *   put:
 *     summary: Actualizar un item de checklist
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actividad:
 *                 type: string
 *                 example: "Revisar y cambiar filtros"
 *               completada:
 *                 type: boolean
 *                 example: true
 *               observacion:
 *                 type: string
 *                 example: "Filtros cambiados correctamente"
 *               orden:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Item actualizado exitosamente
 *       404:
 *         description: Item no encontrado
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', ejecucionChecklistController.actualizar);

/**
 * @swagger
 * /api/ejecucion-checklist/{id}/toggle:
 *   patch:
 *     summary: Marcar item como completado/pendiente
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item
 *         example: 1
 *     responses:
 *       200:
 *         description: Estado cambiado exitosamente
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
 *                   example: "Item marcado como completado"
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionChecklist'
 *       404:
 *         description: Item no encontrado
 *       500:
 *         description: Error del servidor
 */
router.patch('/:id/toggle', ejecucionChecklistController.toggleCompletada);

/**
 * @swagger
 * /api/ejecucion-checklist/{id}:
 *   delete:
 *     summary: Eliminar un item de checklist
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del item
 *         example: 1
 *     responses:
 *       200:
 *         description: Item eliminado exitosamente
 *       404:
 *         description: Item no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', ejecucionChecklistController.eliminar);

/**
 * @swagger
 * /api/ejecucion-checklist/estadisticas/{mantenimiento_ejecutado_id}:
 *   get:
 *     summary: Obtener estadísticas del checklist
 *     tags: [Ejecución Checklist]
 *     parameters:
 *       - in: path
 *         name: mantenimiento_ejecutado_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento ejecutado
 *         example: 1
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 10
 *                     completadas:
 *                       type: integer
 *                       example: 8
 *                     pendientes:
 *                       type: integer
 *                       example: 2
 *                     porcentaje_completado:
 *                       type: integer
 *                       example: 80
 *       500:
 *         description: Error del servidor
 */
router.get('/estadisticas/:mantenimiento_ejecutado_id', ejecucionChecklistController.obtenerEstadisticas);

module.exports = router;