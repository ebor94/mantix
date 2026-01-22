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
 *     
 *     ProgramarGrupoInput:
 *       type: object
 *       required:
 *         - fecha_inicio
 *         - fecha_fin
 *         - prioridad
 *         - exigencia
 *       properties:
 *         fecha_inicio:
 *           type: string
 *           format: date
 *           description: Fecha de inicio de programación
 *           example: "2025-01-01"
 *         fecha_fin:
 *           type: string
 *           format: date
 *           description: Fecha de fin de programación
 *           example: "2025-12-31"
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           description: Prioridad de los mantenimientos
 *           example: "media"
 *         exigencia:
 *           type: string
 *           enum: [Manual/Fabricante, Contractual/Garantia, Cumplimiento Legal]
 *           description: Exigencia del mantenimiento
 *           example: "Manual/Fabricante"
 *         excluir_fines_semana:
 *           type: boolean
 *           description: Excluir fines de semana (mover a siguiente día hábil)
 *           default: false
 *           example: true
 *     
 *     ProgramarMasivoInput:
 *       type: object
 *       required:
 *         - ids_actividades
 *         - fecha_inicio
 *         - fecha_fin
 *         - prioridad
 *         - exigencia
 *       properties:
 *         ids_actividades:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array de IDs de actividades a programar
 *           example: [1, 2, 3, 4, 5]
 *         fecha_inicio:
 *           type: string
 *           format: date
 *           description: Fecha de inicio de programación
 *           example: "2025-01-01"
 *         fecha_fin:
 *           type: string
 *           format: date
 *           description: Fecha de fin de programación
 *           example: "2025-12-31"
 *         prioridad:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *           description: Prioridad de los mantenimientos
 *           example: "alta"
 *         exigencia:
 *           type: string
 *           enum: [Manual/Fabricante, Contractual/Garantia, Cumplimiento Legal]
 *           description: Exigencia del mantenimiento
 *           example: "Contractual/Garantia"
 *         excluir_fines_semana:
 *           type: boolean
 *           description: Excluir fines de semana (mover a siguiente día hábil)
 *           default: false
 *           example: false
 *     
 *     ProgramacionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Se programaron 24 mantenimientos para el grupo G-2025-001 (4 actividades)"
 *         data:
 *           type: object
 *           properties:
 *             grupo_masivo_id:
 *               type: string
 *               example: "G-2025-001"
 *             total_mantenimientos:
 *               type: integer
 *               example: 24
 *             total_actividades:
 *               type: integer
 *               example: 4
 *             detalle:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id_actividad:
 *                     type: integer
 *                     example: 15
 *                   nombre_actividad:
 *                     type: string
 *                     example: "Mantenimiento eléctrico"
 *                   equipo:
 *                     type: string
 *                     example: "Compresor ABC-001"
 *                   sede:
 *                     type: string
 *                     example: "Sede Principal"
 *                   mantenimientos_creados:
 *                     type: integer
 *                     example: 6
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
*
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
 *             excluir_fines_semana: true
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
 * /api/programar-mantenimientos/grupo/{grupoMasivoId}:
 *   post:
 *     summary: Programar mantenimientos para un grupo masivo completo
 *     tags: [Programar Mantenimientos]
 *     description: Genera automáticamente mantenimientos para todas las actividades de un grupo masivo según sus periodicidades individuales
*
 *     parameters:
 *       - in: path
 *         name: grupoMasivoId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo masivo (ej. G-2025-001)
 *         example: "G-2025-001"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgramarGrupoInput'
 *           example:
 *             fecha_inicio: "2025-01-01"
 *             fecha_fin: "2025-12-31"
 *             prioridad: "alta"
 *             exigencia: "Manual/Fabricante"
 *             excluir_fines_semana: true
 *     responses:
 *       201:
 *         description: Mantenimientos del grupo programados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProgramacionResponse'
 *             example:
 *               success: true
 *               message: "Se programaron 24 mantenimientos para el grupo G-2025-001 (4 actividades)"
 *               data:
 *                 grupo_masivo_id: "G-2025-001"
 *                 total_mantenimientos: 24
 *                 total_actividades: 4
 *                 detalle:
 *                   - id_actividad: 15
 *                     nombre_actividad: "Mantenimiento eléctrico"
 *                     equipo: "Compresor ABC-001"
 *                     sede: "Sede Principal"
 *                     mantenimientos_creados: 6
 *                   - id_actividad: 16
 *                     nombre_actividad: "Mantenimiento eléctrico"
 *                     equipo: "Bomba XYZ-002"
 *                     sede: "Sede Principal"
 *                     mantenimientos_creados: 6
 *       400:
 *         description: Parámetros inválidos o faltantes
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
 *                   example: "Se requieren prioridad y exigencia"
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para las categorías del grupo
 *       404:
 *         description: No se encontraron actividades para este grupo
 *       500:
 *         description: Error del servidor
 */
router.post('/grupo/:grupoMasivoId', programarMantenimientosController.programarGrupo);

/**
 * @swagger
 * /api/programar-mantenimientos/masivo:
 *   post:
 *     summary: Programar mantenimientos para múltiples actividades seleccionadas
 *     tags: [Programar Mantenimientos]
 *     description: Genera automáticamente mantenimientos para un conjunto de actividades seleccionadas, cada una según su periodicidad
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgramarMasivoInput'
 *           example:
 *             ids_actividades: [1, 2, 3, 4, 5]
 *             fecha_inicio: "2025-01-01"
 *             fecha_fin: "2025-12-31"
 *             prioridad: "media"
 *             exigencia: "Cumplimiento Legal"
 *             excluir_fines_semana: false
 *     responses:
 *       201:
 *         description: Mantenimientos masivos programados exitosamente
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
 *                   example: "Se programaron 48 mantenimientos para 5 actividades"
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_mantenimientos:
 *                       type: integer
 *                       example: 48
 *                     total_actividades:
 *                       type: integer
 *                       example: 5
 *                     detalle:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_actividad:
 *                             type: integer
 *                             example: 1
 *                           nombre_actividad:
 *                             type: string
 *                             example: "Inspección mensual"
 *                           equipo:
 *                             type: string
 *                             example: "Motor Principal"
 *                           sede:
 *                             type: string
 *                             example: "Planta Norte"
 *                           mantenimientos_creados:
 *                             type: integer
 *                             example: 12
 *             example:
 *               success: true
 *               message: "Se programaron 48 mantenimientos para 5 actividades"
 *               data:
 *                 total_mantenimientos: 48
 *                 total_actividades: 5
 *                 detalle:
 *                   - id_actividad: 1
 *                     nombre_actividad: "Inspección mensual"
 *                     equipo: "Motor Principal"
 *                     sede: "Planta Norte"
 *                     mantenimientos_creados: 12
 *                   - id_actividad: 2
 *                     nombre_actividad: "Revisión trimestral"
 *                     equipo: "Generador A"
 *                     sede: "Planta Norte"
 *                     mantenimientos_creados: 4
 *       400:
 *         description: Parámetros inválidos o faltantes
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
 *                   example: "Se requiere un array de IDs de actividades"
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso para las categorías de las actividades
 *       404:
 *         description: No se encontraron actividades válidas
 *       500:
 *         description: Error del servidor
 */
router.post('/masivo', programarMantenimientosController.programarMasivo);

/**
 * @swagger
 * /api/programar-mantenimientos/plan/{id}:
 *   post:
 *     summary: Programar mantenimientos para todas las actividades de un plan
 *     tags: [Programar Mantenimientos]
*
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
*
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
*
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