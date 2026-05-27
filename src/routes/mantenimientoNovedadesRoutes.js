// ============================================
// src/routes/mantenimientoNovedadesRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const mantenimientoNovedadesController = require('../controllers/mantenimientoNovedadesController');
const { 
  auth, 
  requireEquipoAccess, 
  requireCategoriaAccess,
  authWithCategories 
} = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     MantenimientoNovedad:
 *       type: object
 *       required:
 *         - mantenimiento_programado_id
 *         - tipo_novedad
 *         - descripcion
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado de la novedad
 *         mantenimiento_programado_id:
 *           type: integer
 *           description: ID del mantenimiento programado
 *         tipo_novedad:
 *           type: string
 *           enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *         descripcion:
 *           type: string
 *         motivo:
 *           type: string
 *         fecha_anterior:
 *           type: string
 *           format: date
 *         fecha_nueva:
 *           type: string
 *           format: date
 *         hora_anterior:
 *           type: string
 *           format: time
 *         hora_nueva:
 *           type: string
 *           format: time
 *         estado_anterior_id:
 *           type: integer
 *         estado_nuevo_id:
 *           type: integer
 *         prioridad_anterior:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *         prioridad_nueva:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *         usuario_registro_id:
 *           type: integer
 *         adjuntos:
 *           type: array
 *           items:
 *             type: string
 *         metadata:
 *           type: object
 *         es_visible_proveedor:
 *           type: boolean
 *         notificacion_enviada:
 *           type: boolean
 *         fecha_notificacion:
 *           type: string
 *           format: date-time
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *       example:
 *         id: 1
 *         mantenimiento_programado_id: 10
 *         tipo_novedad: reprogramacion
 *         descripcion: Mantenimiento reprogramado debido a condiciones climáticas adversas
 *         motivo: Lluvia intensa
 *         fecha_anterior: "2024-01-15"
 *         fecha_nueva: "2024-01-20"
 *         hora_anterior: "08:00:00"
 *         hora_nueva: "10:00:00"
 *         usuario_registro_id: 5
 *         es_visible_proveedor: true
 * 
 *     NovedadPlantilla:
 *       type: object
 *       required:
 *         - tipo_novedad
 *         - nombre
 *         - descripcion_plantilla
 *       properties:
 *         id:
 *           type: integer
 *         tipo_novedad:
 *           type: string
 *           enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *         nombre:
 *           type: string
 *         descripcion_plantilla:
 *           type: string
 *         requiere_fecha:
 *           type: boolean
 *         requiere_motivo:
 *           type: boolean
 *         requiere_adjunto:
 *           type: boolean
 *         es_activa:
 *           type: boolean
 *       example:
 *         tipo_novedad: reprogramacion
 *         nombre: Reprogramación por Clima
 *         descripcion_plantilla: Mantenimiento reprogramado debido a condiciones climáticas adversas (lluvia)
 *         requiere_fecha: true
 *         requiere_motivo: true
 *         requiere_adjunto: false
 */

/**
 * @swagger
 * tags:
 *   - name: Mantenimiento Novedades
 *     description: Gestión de novedades y seguimiento de mantenimientos programados
 *   - name: Plantillas Novedades
 *     description: Gestión de plantillas para registro de novedades
 */

// ===== NOVEDADES =====

/**
 * @swagger
 * /api/mantenimiento-novedades:
 *   post:
 *     summary: Crear una nueva novedad de mantenimiento
 *     description: Registra una novedad asociada a un mantenimiento programado. Actualiza automáticamente el mantenimiento si es reprogramación, cambio de estado o cambio de prioridad.
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mantenimiento_programado_id
 *               - tipo_novedad
 *               - descripcion
 *             properties:
 *               mantenimiento_programado_id:
 *                 type: integer
 *                 example: 10
 *               tipo_novedad:
 *                 type: string
 *                 enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *                 example: reprogramacion
 *               descripcion:
 *                 type: string
 *                 example: Mantenimiento reprogramado por condiciones climáticas
 *               motivo:
 *                 type: string
 *                 example: Lluvia intensa
 *               fecha_anterior:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-15"
 *               fecha_nueva:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-20"
 *               hora_anterior:
 *                 type: string
 *                 format: time
 *                 example: "08:00:00"
 *               hora_nueva:
 *                 type: string
 *                 format: time
 *                 example: "10:00:00"
 *               estado_anterior_id:
 *                 type: integer
 *                 example: 1
 *               estado_nuevo_id:
 *                 type: integer
 *                 example: 2
 *               prioridad_anterior:
 *                 type: string
 *                 enum: [baja, media, alta, critica]
 *                 example: media
 *               prioridad_nueva:
 *                 type: string
 *                 enum: [baja, media, alta, critica]
 *                 example: alta
 *               adjuntos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://drive.google.com/file/abc123"]
 *               metadata:
 *                 type: object
 *                 example: { "responsable_contacto": "Juan Pérez", "telefono": "555-1234" }
 *               es_visible_proveedor:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Novedad creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MantenimientoNovedad'
 *       404:
 *         description: Mantenimiento programado no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/', 
  auth, 
  mantenimientoNovedadesController.create
);

/**
 * @swagger
 * /api/mantenimiento-novedades/mantenimiento/{mantenimientoId}:
 *   get:
 *     summary: Listar todas las novedades de un mantenimiento
 *     description: Obtiene el historial completo de novedades de un mantenimiento programado con filtros opcionales
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mantenimientoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento programado
 *       - in: query
 *         name: visible_proveedor
 *         schema:
 *           type: boolean
 *         description: Filtrar por visibilidad para proveedor
 *         example: true
 *       - in: query
 *         name: tipo_novedad
 *         schema:
 *           type: string
 *           enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *         description: Filtrar por tipo de novedad
 *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicial del rango (formato YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha final del rango (formato YYYY-MM-DD)
 *         example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Lista de novedades del mantenimiento
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MantenimientoNovedad'
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimientoId', 
  auth, 
  mantenimientoNovedadesController.getByMantenimientoId
);

/**
 * @swagger
 * /api/mantenimiento-novedades/mantenimiento/{mantenimientoId}/estadisticas:
 *   get:
 *     summary: Obtener estadísticas de novedades por tipo
 *     description: Retorna un resumen de la cantidad de novedades por tipo y la última novedad registrada
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mantenimientoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento programado
 *     responses:
 *       200:
 *         description: Estadísticas de novedades
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_novedades:
 *                   type: integer
 *                   example: 15
 *                 por_tipo:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tipo_novedad:
 *                         type: string
 *                         example: reprogramacion
 *                       cantidad:
 *                         type: integer
 *                         example: 3
 *                 ultima_novedad:
 *                   $ref: '#/components/schemas/MantenimientoNovedad'
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimientoId/estadisticas', 
  auth, 
  mantenimientoNovedadesController.getEstadisticas
);

/**
 * @swagger
 * /api/mantenimiento-novedades/mantenimiento/{mantenimientoId}/resumen:
 *   get:
 *     summary: Obtener resumen de novedades agrupadas por período
 *     description: Genera un resumen de novedades agrupadas por día, semana, mes o año
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mantenimientoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento programado
 *       - in: query
 *         name: periodo
 *         schema:
 *           type: string
 *           enum: [dia, semana, mes, año]
 *           default: mes
 *         description: Período de agrupación
 *         example: mes
 *     responses:
 *       200:
 *         description: Resumen de novedades por período
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mantenimiento_id:
 *                   type: integer
 *                   example: 10
 *                 periodo_agrupacion:
 *                   type: string
 *                   example: mes
 *                 resumen:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       periodo:
 *                         type: string
 *                         example: "2024-01"
 *                       tipo_novedad:
 *                         type: string
 *                         example: reprogramacion
 *                       cantidad:
 *                         type: integer
 *                         example: 2
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimientoId/resumen', 
  auth, 
  mantenimientoNovedadesController.getResumen
);

/**
 * @swagger
 * /api/mantenimiento-novedades/{id}:
 *   get:
 *     summary: Obtener una novedad específica por ID
 *     description: Retorna los detalles completos de una novedad incluyendo información del mantenimiento, usuario y estados
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la novedad
 *     responses:
 *       200:
 *         description: Novedad encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MantenimientoNovedad'
 *       404:
 *         description: Novedad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', 
  auth, 
  mantenimientoNovedadesController.getById
);

/**
 * @swagger
 * /api/mantenimiento-novedades/{id}:
 *   put:
 *     summary: Actualizar una novedad existente
 *     description: Permite modificar los datos de una novedad registrada previamente
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la novedad
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descripcion:
 *                 type: string
 *                 example: Descripción actualizada de la novedad
 *               motivo:
 *                 type: string
 *                 example: Motivo actualizado
 *               fecha_nueva:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-25"
 *               hora_nueva:
 *                 type: string
 *                 format: time
 *                 example: "14:00:00"
 *               adjuntos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://drive.google.com/file/xyz789"]
 *               metadata:
 *                 type: object
 *                 example: { "nota_adicional": "Información extra" }
 *               es_visible_proveedor:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Novedad actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MantenimientoNovedad'
 *       404:
 *         description: Novedad no encontrada
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', 
  auth, 
  mantenimientoNovedadesController.update
);

/**
 * @swagger
 * /api/mantenimiento-novedades/{id}:
 *   delete:
 *     summary: Eliminar una novedad
 *     description: Elimina permanentemente un registro de novedad. Solo administradores.
 *     tags: [Mantenimiento Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la novedad
 *     responses:
 *       200:
 *         description: Novedad eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Novedad eliminada exitosamente
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Novedad no encontrada
 *       403:
 *         description: No tiene permisos para eliminar
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', 
  auth, 
  
  mantenimientoNovedadesController.delete
);

// ===== PLANTILLAS =====

/**
 * @swagger
 * /api/mantenimiento-novedades/plantillas/all:
 *   get:
 *     summary: Listar todas las plantillas de novedades
 *     description: Obtiene todas las plantillas activas, opcionalmente filtradas por tipo
 *     tags: [Plantillas Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo_novedad
 *         schema:
 *           type: string
 *           enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *         description: Filtrar plantillas por tipo de novedad
 *         example: reprogramacion
 *     responses:
 *       200:
 *         description: Lista de plantillas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NovedadPlantilla'
 *       500:
 *         description: Error del servidor
 */
router.get('/plantillas/all', 
  auth, 
  mantenimientoNovedadesController.getPlantillas
);

/**
 * @swagger
 * /api/mantenimiento-novedades/plantillas/{id}:
 *   get:
 *     summary: Obtener una plantilla específica por ID
 *     description: Retorna los detalles completos de una plantilla de novedad
 *     tags: [Plantillas Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la plantilla
 *     responses:
 *       200:
 *         description: Plantilla encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NovedadPlantilla'
 *       404:
 *         description: Plantilla no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/plantillas/:id', 
  auth, 
  mantenimientoNovedadesController.getPlantillaById
);

/**
 * @swagger
 * /api/mantenimiento-novedades/plantillas:
 *   post:
 *     summary: Crear una nueva plantilla de novedad
 *     description: Crea una plantilla reutilizable para el registro de novedades. Solo administradores.
 *     tags: [Plantillas Novedades]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tipo_novedad
 *               - nombre
 *               - descripcion_plantilla
 *             properties:
 *               tipo_novedad:
 *                 type: string
 *                 enum: [reprogramacion, comunicacion_proveedor, cambio_estado, suspension, observacion_general, cambio_prioridad, asignacion_personal, solicitud_requisitos, aprobacion_requisitos, rechazo_requisitos, inicio_trabajo, finalizacion_trabajo, otro]
 *                 example: comunicacion_proveedor
 *               nombre:
 *                 type: string
 *                 example: Solicitud de Documentación
 *               descripcion_plantilla:
 *                 type: string
 *                 example: Se envió correo al proveedor solicitando la documentación técnica necesaria
 *               requiere_fecha:
 *                 type: boolean
 *                 example: false
 *               requiere_motivo:
 *                 type: boolean
 *                 example: false
 *               requiere_adjunto:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Plantilla creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NovedadPlantilla'
 *       409:
 *         description: Ya existe una plantilla con ese nombre para este tipo
 *       403:
 *         description: No tiene permisos para crear plantillas
 *       500:
 *         description: Error del servidor
 */
router.post('/plantillas', 
  auth, 
  
  mantenimientoNovedadesController.createPlantilla
);

/**
 * @swagger
 * /api/mantenimiento-novedades/plantillas/{id}:
 *   put:
 *     summary: Actualizar una plantilla existente
 *     description: Modifica los datos de una plantilla de novedad. Solo administradores.
 *     tags: [Plantillas Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la plantilla
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Nombre actualizado
 *               descripcion_plantilla:
 *                 type: string
 *                 example: Descripción actualizada
 *               requiere_fecha:
 *                 type: boolean
 *                 example: true
 *               requiere_motivo:
 *                 type: boolean
 *                 example: true
 *               requiere_adjunto:
 *                 type: boolean
 *                 example: false
 *               es_activa:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Plantilla actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NovedadPlantilla'
 *       404:
 *         description: Plantilla no encontrada
 *       403:
 *         description: No tiene permisos para actualizar
 *       500:
 *         description: Error del servidor
 */
router.put('/plantillas/:id', 
  auth, 
  
  mantenimientoNovedadesController.updatePlantilla
);

/**
 * @swagger
 * /api/mantenimiento-novedades/plantillas/{id}:
 *   delete:
 *     summary: Eliminar una plantilla
 *     description: Elimina permanentemente una plantilla de novedad. Solo administradores.
 *     tags: [Plantillas Novedades]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la plantilla
 *     responses:
 *       200:
 *         description: Plantilla eliminada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Plantilla eliminada exitosamente
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Plantilla no encontrada
 *       403:
 *         description: No tiene permisos para eliminar
 *       500:
 *         description: Error del servidor
 */
router.delete('/plantillas/:id', 
  auth, 
  
  mantenimientoNovedadesController.deletePlantilla
);

module.exports = router;