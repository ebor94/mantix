
// ============================================
// src/routes/dashboardRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { auth } = require('../middleware/auth');

router.use(auth);

/**
 * @swagger
 * /api/dashboard/kpis:
 *   get:
 *     summary: Obtener KPIs principales
 *     description: Devuelve los indicadores clave de rendimiento (KPIs) de mantenimiento por sede, incluyendo mantenimientos programados, ejecutados y porcentaje de cumplimiento para un mes específico.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Mes a consultar (1-12). Si no se especifica, usa el mes actual.
 *         example: 10
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año a consultar. Si no se especifica, usa el año actual.
 *         example: 2025
 *     responses:
 *       '200':
 *         description: KPIs obtenidos exitosamente.
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
 *                     type: object
 *                     properties:
 *                       sede:
 *                         type: string
 *                         example: "Sede Principal"
 *                       codigo:
 *                         type: string
 *                         example: "SED001"
 *                       programados:
 *                         type: integer
 *                         description: Total de mantenimientos programados
 *                         example: 45
 *                       ejecutados:
 *                         type: integer
 *                         description: Total de mantenimientos ejecutados
 *                         example: 38
 *                       cumplimiento:
 *                         type: number
 *                         format: decimal
 *                         description: Porcentaje de cumplimiento
 *                         example: 84.44
 *             example:
 *               success: true
 *               data:
 *                 - sede: "Sede Principal"
 *                   codigo: "SED001"
 *                   programados: 45
 *                   ejecutados: 38
 *                   cumplimiento: 84.44
 *                 - sede: "Sede Norte"
 *                   codigo: "SED002"
 *                   programados: 30
 *                   ejecutados: 28
 *                   cumplimiento: 93.33
 *                 - sede: "Sede Sur"
 *                   codigo: "SED003"
 *                   programados: 25
 *                   ejecutados: 20
 *                   cumplimiento: 80.00
 *       '401':
 *         description: No autorizado. Token inválido o no proporcionado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/kpis', dashboardController.getKPIs);

/**
 * @swagger
 * /api/dashboard/cumplimiento-sede:
 *   get:
 *     summary: Obtener cumplimiento por sede
 *     description: Devuelve estadísticas de cumplimiento de mantenimientos agrupadas por sede.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Mes a consultar (1-12)
 *         example: 10
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año a consultar
 *         example: 2025
 *     responses:
 *       '200':
 *         description: Cumplimiento por sede obtenido exitosamente.
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
 *                     mantenimientos:
 *                       type: string
 *                       example: "ultimosMantenimientos"
 *                     solicitudes:
 *                       type: string
 *                       example: "ultimasSolicitudes"
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/cumplimiento-sede', dashboardController.getCumplimientoPorSede);

/**
 * @swagger
 * /api/dashboard/cumplimiento-categoria:
 *   get:
 *     summary: Obtener cumplimiento por categoría
 *     description: Devuelve el porcentaje de cumplimiento de mantenimientos agrupados por categoría de mantenimiento para un período específico.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Mes a consultar (1-12). Si no se especifica, usa el mes actual.
 *         example: 10
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año a consultar. Si no se especifica, usa el año actual.
 *         example: 2025
 *     responses:
 *       '200':
 *         description: Cumplimiento por categoría obtenido exitosamente.
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
 *                     type: object
 *                     properties:
 *                       categoria:
 *                         type: string
 *                         example: "Equipos Industriales"
 *                       color:
 *                         type: string
 *                         description: Color hexadecimal para gráficos
 *                         example: "#3B82F6"
 *                       programados:
 *                         type: integer
 *                         description: Total de mantenimientos programados en esta categoría
 *                         example: 35
 *                       ejecutados:
 *                         type: integer
 *                         description: Total de mantenimientos ejecutados en esta categoría
 *                         example: 30
 *                       cumplimiento:
 *                         type: number
 *                         format: decimal
 *                         description: Porcentaje de cumplimiento
 *                         example: 85.71
 *             example:
 *               success: true
 *               data:
 *                 - categoria: "Equipos Industriales"
 *                   color: "#3B82F6"
 *                   programados: 35
 *                   ejecutados: 30
 *                   cumplimiento: 85.71
 *                 - categoria: "Sistemas Eléctricos"
 *                   color: "#EF4444"
 *                   programados: 28
 *                   ejecutados: 26
 *                   cumplimiento: 92.86
 *                 - categoria: "HVAC"
 *                   color: "#10B981"
 *                   programados: 20
 *                   ejecutados: 18
 *                   cumplimiento: 90.00
 *                 - categoria: "Plomería"
 *                   color: "#F59E0B"
 *                   programados: 15
 *                   ejecutados: 12
 *                   cumplimiento: 80.00
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/cumplimiento-categoria', dashboardController.getCumplimientoPorCategoria);

/**
 * @swagger
 * /api/dashboard/estadisticas-solicitudes:
 *   get:
 *     summary: Obtener estadísticas de solicitudes
 *     description: Devuelve estadísticas detalladas de las solicitudes de mantenimiento, incluyendo distribución por prioridad, tipo, estado y tiempo promedio de respuesta.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Mes a consultar (1-12). Si no se especifica, usa el mes actual.
 *         example: 10
 *       - in: query
 *         name: anio
 *         schema:
 *           type: integer
 *         description: Año a consultar. Si no se especifica, usa el año actual.
 *         example: 2025
 *     responses:
 *       '200':
 *         description: Estadísticas de solicitudes obtenidas exitosamente.
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
 *                     por_prioridad:
 *                       type: array
 *                       description: Distribución de solicitudes por nivel de prioridad
 *                       items:
 *                         type: object
 *                         properties:
 *                           prioridad:
 *                             type: string
 *                             enum: [baja, media, alta, critica]
 *                             example: "alta"
 *                           total:
 *                             type: integer
 *                             example: 15
 *                     por_tipo:
 *                       type: array
 *                       description: Distribución de solicitudes por tipo de mantenimiento
 *                       items:
 *                         type: object
 *                         properties:
 *                           tipo:
 *                             type: string
 *                             enum: [correctivo, preventivo, mejora]
 *                             example: "correctivo"
 *                           total:
 *                             type: integer
 *                             example: 22
 *                     por_estado:
 *                       type: array
 *                       description: Distribución de solicitudes por estado
 *                       items:
 *                         type: object
 *                         properties:
 *                           estado_id:
 *                             type: integer
 *                             example: 1
 *                           total:
 *                             type: integer
 *                             example: 18
 *                           estado:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               nombre:
 *                                 type: string
 *                                 example: "Pendiente"
 *                               color:
 *                                 type: string
 *                                 example: "#FFA500"
 *                     tiempo_promedio_respuesta:
 *                       type: number
 *                       format: decimal
 *                       description: Tiempo promedio de respuesta en horas
 *                       example: 24.5
 *             example:
 *               success: true
 *               data:
 *                 por_prioridad:
 *                   - prioridad: "critica"
 *                     total: 5
 *                   - prioridad: "alta"
 *                     total: 15
 *                   - prioridad: "media"
 *                     total: 25
 *                   - prioridad: "baja"
 *                     total: 10
 *                 por_tipo:
 *                   - tipo: "correctivo"
 *                     total: 30
 *                   - tipo: "preventivo"
 *                     total: 20
 *                   - tipo: "mejora"
 *                     total: 5
 *                 por_estado:
 *                   - estado_id: 1
 *                     total: 12
 *                     estado:
 *                       id: 1
 *                       nombre: "Pendiente"
 *                       color: "#FFA500"
 *                   - estado_id: 2
 *                     total: 18
 *                     estado:
 *                       id: 2
 *                       nombre: "Aprobada"
 *                       color: "#3B82F6"
 *                   - estado_id: 3
 *                     total: 15
 *                     estado:
 *                       id: 3
 *                       nombre: "Asignada"
 *                       color: "#8B5CF6"
 *                   - estado_id: 4
 *                     total: 10
 *                     estado:
 *                       id: 4
 *                       nombre: "Resuelta"
 *                       color: "#10B981"
 *                 tiempo_promedio_respuesta: 24.5
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/estadisticas-solicitudes', dashboardController.getEstadisticasSolicitudes);

/**
 * @swagger
 * /api/dashboard/actividad-reciente:
 *   get:
 *     summary: Obtener actividad reciente
 *     description: Devuelve los últimos mantenimientos ejecutados y las últimas solicitudes creadas en el sistema, útil para mostrar actividad en tiempo real.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Número máximo de registros a devolver para cada tipo
 *         example: 10
 *     responses:
 *       '200':
 *         description: Actividad reciente obtenida exitosamente.
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
 *                     mantenimientos:
 *                       type: array
 *                       description: Últimos mantenimientos ejecutados
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 15
 *                           fecha_ejecucion:
 *                             type: string
 *                             format: date
 *                             example: "2025-10-08"
 *                           trabajo_realizado:
 *                             type: string
 *                             example: "Mantenimiento preventivo del compresor"
 *                           costo_real:
 *                             type: number
 *                             example: 350000.00
 *                           calificacion_servicio:
 *                             type: integer
 *                             example: 5
 *                           usuario:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 4
 *                               nombre:
 *                                 type: string
 *                                 example: "Luis"
 *                               apellido:
 *                                 type: string
 *                                 example: "Martínez"
 *                           programado:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 25
 *                               codigo:
 *                                 type: string
 *                                 example: "MNT-2025-025"
 *                               actividad:
 *                                 type: object
 *                                 properties:
 *                                   sede:
 *                                     type: object
 *                                     properties:
 *                                       nombre:
 *                                         type: string
 *                                         example: "Sede Principal"
 *                                   categoria:
 *                                     type: object
 *                                     properties:
 *                                       nombre:
 *                                         type: string
 *                                         example: "Equipos Industriales"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-10-08T14:30:00.000Z"
 *                     solicitudes:
 *                       type: array
 *                       description: Últimas solicitudes creadas
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 45
 *                           titulo:
 *                             type: string
 *                             example: "Falla en compresor"
 *                           prioridad:
 *                             type: string
 *                             example: "alta"
 *                           tipo:
 *                             type: string
 *                             example: "correctivo"
 *                           solicitante:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 3
 *                               nombre:
 *                                 type: string
 *                                 example: "Pedro"
 *                               apellido:
 *                                 type: string
 *                                 example: "González"
 *                           sede:
 *                             type: object
 *                             properties:
 *                               codigo:
 *                                 type: string
 *                                 example: "SED001"
 *                               nombre:
 *                                 type: string
 *                                 example: "Sede Principal"
 *                           estado:
 *                             type: object
 *                             properties:
 *                               nombre:
 *                                 type: string
 *                                 example: "Pendiente"
 *                               color:
 *                                 type: string
 *                                 example: "#FFA500"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-10-08T13:45:00.000Z"
 *             example:
 *               success: true
 *               data:
 *                 mantenimientos:
 *                   - id: 15
 *                     fecha_ejecucion: "2025-10-08"
 *                     trabajo_realizado: "Mantenimiento preventivo del compresor"
 *                     costo_real: 350000.00
 *                     calificacion_servicio: 5
 *                     usuario:
 *                       id: 4
 *                       nombre: "Luis"
 *                       apellido: "Martínez"
 *                     programado:
 *                       codigo: "MNT-2025-025"
 *                       actividad:
 *                         sede:
 *                           nombre: "Sede Principal"
 *                         categoria:
 *                           nombre: "Equipos Industriales"
 *                     created_at: "2025-10-08T14:30:00.000Z"
 *                 solicitudes:
 *                   - id: 45
 *                     titulo: "Falla en compresor"
 *                     prioridad: "alta"
 *                     tipo: "correctivo"
 *                     solicitante:
 *                       nombre: "Pedro"
 *                       apellido: "González"
 *                     sede:
 *                       nombre: "Sede Principal"
 *                     estado:
 *                       nombre: "Pendiente"
 *                       color: "#FFA500"
 *                     created_at: "2025-10-08T13:45:00.000Z"
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/actividad-reciente', dashboardController.getActividadReciente);

/**
 * @swagger
 * /api/dashboard/cumplimiento:
 *   get:
 *     summary: Obtener indicador de cumplimiento
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: periodo
 *         schema:
 *           type: string
 *           enum: [diario, semanal, mensual, anual, semestral]
 *         description: Período del indicador (default mensual)
 *       - in: query
 *         name: sede_id
 *         schema:
 *           type: integer
 *         description: ID de sede (opcional, null = global)
 *       - in: query
 *         name: categoria_id
 *         schema:
 *           type: integer
 *         description: ID de categoría (opcional, null = global)
 *     responses:
 *       200:
 *         description: Indicador de cumplimiento
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error del servidor
 */
router.get('/cumplimiento', dashboardController.getCumplimiento);

/**
 * @swagger
 * /api/dashboard/cumplimiento/multiple:
 *   get:
 *     summary: Obtener múltiples indicadores (por sede o categoría)
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: periodo
 *         schema:
 *           type: string
 *           enum: [trimestral, semanal, mensual, anual]
 *         description: Período del indicador (default mensual)
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [sede, categoria]
 *         description: Tipo de agrupación (default sede)
 *     responses:
 *       200:
 *         description: Lista de indicadores
 *       400:
 *         description: Parámetros inválidos
 *       500:
 *         description: Error del servidor
 */
router.get('/cumplimiento/multiple', dashboardController.getCumplimientoMultiple);

module.exports = router;