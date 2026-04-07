// ============================================
// src/routes/equiposRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equiposController');
const { 
  auth, 
  requireEquipoAccess, 
  requireCategoriaAccess,
  authWithCategories 
} = require('../middleware/auth');

/**
 * @swagger
 * /api/equipos:
 *   get:
 *     summary: Obtener listado de equipos
 *     description: Devuelve una lista de equipos según las categorías permitidas del usuario.
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Listado de equipos obtenido exitosamente (filtrado por permisos).
 *       '401':
 *         description: No autorizado.
 *       '403':
 *         description: No tienes categorías asignadas.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', authWithCategories, equiposController.getAll);

/**
 * @swagger
 * /api/equipos/categoria/{categoriaId}:
 *   get:
 *     summary: Obtener equipos por categoría
 *     description: Devuelve todos los equipos de una categoría específica (requiere acceso a esa categoría).
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoriaId
 *         required: true
 *         description: ID de la categoría
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Equipos obtenidos exitosamente.
 *       '403':
 *         description: No tienes permiso para ver equipos de esta categoría.
 */
router.get('/categoria/:categoriaId', auth, requireCategoriaAccess, equiposController.getByCategoriaId);

/**
 * @swagger
 * /api/equipos/{id}:
 *   get:
 *     summary: Obtener un equipo por su ID
 *     description: Devuelve los detalles completos de un equipo específico (requiere acceso a su categoría).
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico del equipo a obtener.
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Detalles del equipo obtenidos exitosamente.
 *       '401':
 *         description: No autorizado.
 *       '403':
 *         description: No tienes permiso para ver este equipo.
 *       '404':
 *         description: Equipo no encontrado.
 */
router.get('/:id', auth, requireEquipoAccess, equiposController.getById);

/**
 * @swagger
 * /api/equipos:
 *   post:
 *     summary: Crear un nuevo equipo
 *     description: Registra un nuevo equipo (requiere acceso a la categoría especificada).
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - codigo
 *               - nombre
 *               - categoria_id
 *               - sede_id
 *             properties:
 *               codigo:
 *                 type: string
 *                 maxLength: 50
 *                 example: "EQ-001"
 *               nombre:
 *                 type: string
 *                 maxLength: 150
 *                 example: "Compresor de Aire Industrial"
 *               categoria_id:
 *                 type: integer
 *                 example: 1
 *               sede_id:
 *                 type: integer
 *                 example: 1
 *               marca:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Atlas Copco"
 *               modelo:
 *                 type: string
 *                 maxLength: 100
 *                 example: "GA 55"
 *               numero_serie:
 *                 type: string
 *                 maxLength: 100
 *                 example: "AC123456789"
 *               ubicacion_especifica:
 *                 type: string
 *                 example: "Sala de compresores, Planta 2"
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *                 example: "2023-01-15"
 *               fecha_compra:
 *                 type: string
 *                 format: date
 *                 example: "2022-12-01"
 *               valor_compra:
 *                 type: number
 *                 format: decimal
 *                 example: 45000000.00
 *               vida_util_anos:
 *                 type: integer
 *                 example: 10
 *               responsable_id:
 *                 type: integer
 *                 example: 2
 *               estado:
 *                 type: string
 *                 enum: [operativo, fuera_servicio, en_mantenimiento, dado_baja]
 *                 example: "operativo"
 *               observaciones:
 *                 type: string
 *                 example: "Equipo requiere mantenimiento preventivo cada 500 horas"
 *               activo:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       '201':
 *         description: Equipo creado exitosamente.
 *       '400':
 *         description: Error de validación.
 *       '401':
 *         description: No autorizado.
 *       '403':
 *         description: No tienes permiso para crear equipos en esta categoría.
 *       '409':
 *         description: El código de equipo ya está registrado.
 */
router.post('/', auth, requireCategoriaAccess, equiposController.create);

/**
 * @swagger
 * /api/equipos/{id}:
 *   put:
 *     summary: Actualizar un equipo existente
 *     description: Actualiza los datos de un equipo (requiere acceso a su categoría).
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del equipo a actualizar.
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               codigo:
 *                 type: string
 *                 example: "EQ-001-UPD"
 *               nombre:
 *                 type: string
 *                 example: "Compresor Renovado"
 *               estado:
 *                 type: string
 *                 enum: [operativo, fuera_servicio, en_mantenimiento, dado_baja]
 *                 example: "en_mantenimiento"
 *               observaciones:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Equipo actualizado exitosamente.
 *       '403':
 *         description: No tienes permiso para editar este equipo.
 *       '404':
 *         description: Equipo no encontrado.
 */
router.put('/:id', auth, requireEquipoAccess, equiposController.update);

/**
 * @swagger
 * /api/equipos/{id}:
 *   delete:
 *     summary: Eliminar un equipo
 *     description: Elimina un equipo (requiere acceso a su categoría).
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del equipo a eliminar.
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Equipo eliminado exitosamente.
 *       '403':
 *         description: No tienes permiso para eliminar este equipo.
 *       '404':
 *         description: Equipo no encontrado.
 */
router.delete('/:id', auth, requireEquipoAccess, equiposController.delete);

/**
 * @swagger
 * /api/equipos/{equipoId}/historial-mantenimientos:
 *   get:
 *     summary: Obtener historial de mantenimientos de un equipo
 *     description: Retorna el historial completo de mantenimientos programados y ejecutados de un equipo específico con filtros opcionales y paginación
 *     tags:
 *       - Equipos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: equipoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID único del equipo
 *         example: 6
  *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial del rango de búsqueda (YYYY-MM-DD)
 *         example: 2024-01-01
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final del rango de búsqueda (YYYY-MM-DD)
 *         example: 2024-12-31
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Cantidad de registros por página
 *         example: 20
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Número de página a consultar
 *         example: 1
 *     responses:
 *       200:
 *         description: Historial obtenido exitosamente
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
 *                     equipo_id:
 *                       type: integer
 *                       example: 6
 *                     estadisticas:
 *                       type: object
 *                       properties:
 *                         total_mantenimientos:
 *                           type: integer
 *                           example: 45
 *                         completados:
 *                           type: integer
 *                           example: 38
 *                         pendientes:
 *                           type: integer
 *                           example: 5
 *                         reprogramados:
 *                           type: integer
 *                           example: 2
 *                     paginacion:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 45
 *                         pagina_actual:
 *                           type: integer
 *                           example: 1
 *                         total_paginas:
 *                           type: integer
 *                           example: 3
 *                         limite:
 *                           type: integer
 *                           example: 50
 *                     mantenimientos:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 123
 *                           codigo:
 *                             type: string
 *                             example: MANT-2024-001
 *                           fecha_programada:
 *                             type: string
 *                             format: date
 *                             example: 2024-11-15
 *                           hora_programada:
 *                             type: string
 *                             format: time
 *                             example: 14:30:00
 *                           prioridad:
 *                             type: string
 *                             enum: [baja, media, alta, critica]
 *                             example: alta
 *                           reprogramaciones:
 *                             type: integer
 *                             example: 0
 *                           observaciones:
 *                             type: string
 *                             example: Mantenimiento preventivo trimestral
 *                           estado:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               nombre:
 *                                 type: string
 *                                 example: Completado
 *                               color:
 *                                 type: string
 *                                 example: #28a745
 *                           actividad:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               nombre:
 *                                 type: string
 *                                 example: Revisión de sistema eléctrico
 *                               equipo:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   codigo:
 *                                     type: string
 *                                   nombre:
 *                                     type: string
 *                               categoria:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   nombre:
 *                                     type: string
 *                               periodicidad:
 *                                 type: object
 *                                 properties:
 *                                   nombre:
 *                                     type: string
 *                                     example: Trimestral
 *                                   dias:
 *                                     type: integer
 *                                     example: 90
 *                           ejecucion:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               fecha_ejecucion:
 *                                 type: string
 *                                 format: date
 *                               duracion_real:
 *                                 type: number
 *                               costo_real:
 *                                 type: number
 *       400:
 *         description: Parámetros inválidos
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
 *                   example: El ID del equipo debe ser un número válido
 *       401:
 *         description: No autorizado - Token inválido o ausente
 *       403:
 *         description: Acceso denegado - No tiene permisos para este equipo
 *       404:
 *         description: Equipo no encontrado
 *       500:
 *         description: Error interno del servidor
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
 *                   example: Error al obtener el historial de mantenimientos
 *                 error:
 *                   type: string
 */
router.get('/:equipoId/historial-mantenimientos', auth, requireEquipoAccess, equiposController.historialMantenimientoEquipo);

/**
 * @swagger
 * /api/equipos/{equipoId}/resumen-mantenimientos:
 *   get:
 *     summary: Obtener resumen estadístico de mantenimientos de un equipo
 *     description: Retorna estadísticas consolidadas de todos los mantenimientos del equipo incluyendo totales, promedios y costos
 *     tags:
 *       - Equipos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: equipoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID único del equipo
 *         example: 6
 *     responses:
 *       200:
 *         description: Resumen obtenido exitosamente
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
 *                     equipo_id:
 *                       type: integer
 *                       example: 6
 *                     resumen:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           description: Total de mantenimientos programados
 *                           example: 45
 *                         duracion_promedio:
 *                           type: number
 *                           format: float
 *                           description: Duración promedio en horas de los mantenimientos ejecutados
 *                           example: 2.5
 *                           nullable: true
 *                         costo_total:
 *                           type: number
 *                           format: decimal
 *                           description: Costo total acumulado de mantenimientos ejecutados
 *                           example: 1500000.00
 *                           nullable: true
 *             examples:
 *               example1:
 *                 summary: Equipo con mantenimientos ejecutados
 *                 value:
 *                   success: true
 *                   data:
 *                     equipo_id: 6
 *                     resumen:
 *                       total: 45
 *                       duracion_promedio: 2.5
 *                       costo_total: 1500000.00
 *               example2:
 *                 summary: Equipo sin mantenimientos ejecutados
 *                 value:
 *                   success: true
 *                   data:
 *                     equipo_id: 6
 *                     resumen:
 *                       total: 10
 *                       duracion_promedio: null
 *                       costo_total: null
 *       400:
 *         description: Parámetros inválidos
 *       401:
 *         description: No autorizado - Token inválido o ausente
 *       403:
 *         description: Acceso denegado - No tiene permisos para este equipo
 *       404:
 *         description: Equipo no encontrado
 *       500:
 *         description: Error interno del servidor
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
 *                   example: Error al obtener el resumen de mantenimientos
 *                 error:
 *                   type: string
 */
router.get('/:equipoId/resumen-mantenimientos', auth, requireEquipoAccess, equiposController.ResumenMantenimientos);

module.exports = router;