// ============================================
// src/routes/programarMantenimientosRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const programarMantenimientosController = require('../controllers/programarMantenimientosController');
const { auth } = require('../middleware/auth');

// ⚠️ CRÍTICO: Aplicar middleware de autenticación a TODAS las rutas
router.use(auth);

/**
 * @swagger
 * components:
 *   schemas:
 *     ProgramarActividadInput:
 *       type: object
 *       properties:
 *         fecha_inicio:
 *           type: string
 *           format: date
 *           description: Fecha de inicio (opcional, usa la del plan si no se especifica)
 *           example: "2025-01-01"
 *         fecha_fin:
 *           type: string
 *           format: date
 *           description: Fecha de fin (opcional, usa la del plan si no se especifica)
 *           example: "2025-12-31"
 *         estado_id:
 *           type: integer
 *           description: ID del estado inicial (opcional, por defecto 1 - Programado)
 *           example: 1
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           description: Prioridad de los mantenimientos (opcional, por defecto media)
 *           example: "media"
 *     
 *     ProgramarPlanInput:
 *       type: object
 *       properties:
 *         estado_id:
 *           type: integer
 *           description: ID del estado inicial
 *           example: 1
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           example: "media"
 *         solo_activas:
 *           type: boolean
 *           description: Programar solo actividades activas
 *           default: true
 *           example: true
 *     
 *     ReprogramarActividadInput:
 *       type: object
 *       properties:
 *         fecha_inicio:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         fecha_fin:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *         eliminar_existentes:
 *           type: boolean
 *           description: Eliminar mantenimientos pendientes existentes
 *           default: true
 *           example: true
 */

/**
 * @swagger
 * tags:
 *   name: Programar Mantenimientos
 *   description: API para programación automática de mantenimientos desde actividades
 */

/**
 * @swagger
 * /api/programar-mantenimientos/actividad/{id}:
 *   post:
 *     summary: Programar mantenimientos para una actividad específica
 *     tags: [Programar Mantenimientos]
 *     description: Genera automáticamente mantenimientos programados según la periodicidad de la actividad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la actividad
 *         example: 1
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgramarActividadInput'
 *           example:
 *             fecha_inicio: "2026-01-01"
 *             fecha_fin: "2026-12-31"
 *             estado_id: 1
 *             prioridad: "alta"
 *             excluir_fines_semana : true
 *             exigencias: "Contractual/Garantia"
 *     responses:
 *       201:
 *         description: Mantenimientos programados exitosamente
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para esta categoría
 *       404:
 *         description: Actividad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.post('/actividad/:id', programarMantenimientosController.programarActividad);

/**
 * @swagger
 * /api/programar-mantenimientos/plan/{id}:
 *   post:
 *     summary: Programar mantenimientos para todas las actividades de un plan
 *     tags: [Programar Mantenimientos]
 *     security:
 *       - BearerAuth: []
 *     description: Genera automáticamente todos los mantenimientos del año para el plan completo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del plan de mantenimiento
 *         example: 1
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgramarPlanInput'
 *           example:
 *             estado_id: 1
 *             prioridad: "media"
 *             solo_activas: true
 *     responses:
 *       201:
 *         description: Plan programado exitosamente
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para las categorías del plan
 *       404:
 *         description: Plan no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/plan/:id', programarMantenimientosController.programarPlan);

/**
 * @swagger
 * /api/programar-mantenimientos/reprogramar-actividad/{id}:
 *   post:
 *     summary: Reprogramar mantenimientos de una actividad
 *     tags: [Programar Mantenimientos]
 *     security:
 *       - BearerAuth: []
 *     description: Elimina mantenimientos pendientes y genera nuevos según nuevas fechas
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la actividad
 *         example: 1
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReprogramarActividadInput'
 *           example:
 *             fecha_inicio: "2025-02-01"
 *             fecha_fin: "2025-12-31"
 *             eliminar_existentes: true
 *     responses:
 *       201:
 *         description: Actividad reprogramada exitosamente
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para esta categoría
 *       404:
 *         description: Actividad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.post('/reprogramar-actividad/:id', programarMantenimientosController.reprogramarActividad);

/**
 * @swagger
 * /api/programar-mantenimientos/preview:
 *   get:
 *     summary: Previsualizar programación sin crear registros
 *     tags: [Programar Mantenimientos]
 *     security:
 *       - BearerAuth: []
 *     description: Muestra las fechas que se generarían sin crear los mantenimientos
 *     parameters:
 *       - in: query
 *         name: actividad_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la actividad
 *         example: 1
 *       - in: query
 *         name: fecha_inicio
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de inicio (opcional)
 *         example: "2025-01-01"
 *       - in: query
 *         name: fecha_fin
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de fin (opcional)
 *         example: "2025-12-31"
 *     responses:
 *       200:
 *         description: Preview generado exitosamente
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para esta categoría
 *       404:
 *         description: Actividad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/preview', programarMantenimientosController.previsualizarProgramacion);

module.exports = router;