// ============================================
// src/routes/planActividadRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const planActividadController = require('../controllers/planActividadController');
const { auth, requireActividadAccess, requireSuperAdmin } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Plan Actividades
 *   description: API para gestión de actividades de los planes de mantenimiento
 */

// Todas las rutas requieren autenticación
router.use(auth);

/**
 * @swagger
 * /api/plan-actividades:
 *   get:
 *     summary: Obtener todas las actividades (filtradas por categorías del usuario)
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: plan_id
 *         schema:
 *           type: integer
 *         description: Filtrar por plan de mantenimiento
 *       - in: query
 *         name: sede_id
 *         schema:
 *           type: integer
 *         description: Filtrar por sede
 *       - in: query
 *         name: categoria_id
 *         schema:
 *           type: integer
 *         description: Filtrar por categoría
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: Filtrar por estado activo/inactivo
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Lista de actividades obtenida exitosamente (filtradas por permisos)
 *       401:
 *         description: No autorizado
 *       403:
 *         description: No tienes categorías asignadas
 */
router.get('/', planActividadController.obtenerTodas);

/**
 * @swagger
 * /api/plan-actividades/categoria/{categoriaId}:
 *   get:
 *     summary: Obtener actividades por categoría específica
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoriaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría
 *     responses:
 *       200:
 *         description: Actividades obtenidas exitosamente
 *       403:
 *         description: No tienes permiso para ver actividades de esta categoría
 */
router.get('/categoria/:categoriaId', planActividadController.obtenerPorCategoria);

/**
 * @swagger
 * /api/plan-actividades/{id}:
 *   get:
 *     summary: Obtener una actividad por ID
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Actividad encontrada
 *       403:
 *         description: No tienes permiso para ver esta actividad
 *       404:
 *         description: Actividad no encontrada
 */
router.get('/:id', requireActividadAccess, planActividadController.obtenerPorId);

/**
 * @swagger
 * /api/plan-actividades:
 *   post:
 *     summary: Crear una nueva actividad
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan_id
 *               - categoria_id
 *               - nombre
 *               - sede_id
 *               - periodicidad_id
 *               - responsable_tipo
 *     responses:
 *       201:
 *         description: Actividad creada exitosamente
 *       403:
 *         description: No tienes permiso para crear actividades en esta categoría
 */
router.post('/', planActividadController.crear);

/**
 * @swagger
 * /api/plan-actividades/{id}:
 *   put:
 *     summary: Actualizar una actividad
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Actividad actualizada exitosamente
 *       403:
 *         description: No tienes permiso para editar esta actividad
 */
router.put('/:id', requireActividadAccess, planActividadController.actualizar);

/**
 * @swagger
 * /api/plan-actividades/{id}/toggle:
 *   patch:
 *     summary: Activar o desactivar una actividad
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Estado cambiado exitosamente
 *       403:
 *         description: No tienes permiso para modificar esta actividad
 */
router.patch('/:id/toggle', requireActividadAccess, planActividadController.toggleActivo);

/**
 * @swagger
 * /api/plan-actividades/{id}:
 *   delete:
 *     summary: Eliminar una actividad
 *     tags: [Plan Actividades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Actividad eliminada exitosamente
 *       403:
 *         description: No tienes permiso para eliminar esta actividad
 *       409:
 *         description: No se puede eliminar porque tiene mantenimientos asociados
 */
router.delete('/:id', requireActividadAccess, planActividadController.eliminar);

module.exports = router;