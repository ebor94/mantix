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

/**
 * @swagger
 * /api/plan-actividades/crear-masivo:
 *   post:
 *     summary: Crear múltiples actividades de plan para varios equipos
 *     description: Crea actividades de mantenimiento en lote para múltiples equipos con la misma configuración. Todas las actividades creadas compartirán el mismo grupo_masivo_id para facilitar su gestión posterior.
 *     tags: [Plan de Actividades]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - equipos_ids
 *               - plan_id
 *               - categoria_id
 *               - tipo_mantenimiento_id
 *               - nombre
 *               - sede_id
 *               - periodicidad_id
 *               - responsable_tipo
 *             properties:
 *               equipos_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 minItems: 2
 *                 description: Array de IDs de equipos (mínimo 2 equipos requeridos)
 *                 example: [1, 2, 3, 5]
 *               plan_id:
 *                 type: integer
 *                 description: ID del plan de mantenimiento
 *                 example: 1
 *               categoria_id:
 *                 type: integer
 *                 description: ID de la categoría de mantenimiento
 *                 example: 2
 *               tipo_mantenimiento_id:
 *                 type: integer
 *                 description: ID del tipo de mantenimiento
 *                 example: 1
 *               nombre:
 *                 type: string
 *                 maxLength: 200
 *                 description: Nombre de la actividad
 *                 example: "Inspección eléctrica general"
 *               descripcion:
 *                 type: string
 *                 description: Descripción detallada de la actividad
 *                 example: "Revisión completa del sistema eléctrico incluyendo tableros y conexiones"
 *               sede_id:
 *                 type: integer
 *                 description: ID de la sede donde se realizará el mantenimiento
 *                 example: 1
 *               periodicidad_id:
 *                 type: integer
 *                 description: ID de la periodicidad del mantenimiento
 *                 example: 3
 *               responsable_tipo:
 *                 type: string
 *                 enum: [interno, externo]
 *                 description: Tipo de responsable del mantenimiento
 *                 example: "interno"
 *               responsable_usuario_id:
 *                 type: integer
 *                 description: ID del usuario responsable (requerido si responsable_tipo es 'interno')
 *                 example: 5
 *               responsable_proveedor_id:
 *                 type: integer
 *                 description: ID del proveedor responsable (requerido si responsable_tipo es 'externo')
 *                 example: null
 *               duracion_estimada_horas:
 *                 type: number
 *                 format: decimal
 *                 description: Duración estimada en horas
 *                 example: 2.5
 *               costo_estimado:
 *                 type: number
 *                 format: decimal
 *                 description: Costo estimado del mantenimiento
 *                 example: 150000
 *               observaciones:
 *                 type: string
 *                 description: Observaciones adicionales
 *                 example: "Verificar estado de breakers principales"
 *               activo:
 *                 type: boolean
 *                 description: Estado de la actividad
 *                 default: true
 *                 example: true
 *           examples:
 *             crearMasivoInterno:
 *               summary: Creación masiva con responsable interno
 *               value:
 *                 equipos_ids: [1, 2, 3]
 *                 plan_id: 1
 *                 categoria_id: 2
 *                 tipo_mantenimiento_id: 1
 *                 nombre: "Mantenimiento preventivo eléctrico"
 *                 descripcion: "Revisión general del sistema eléctrico"
 *                 sede_id: 1
 *                 periodicidad_id: 3
 *                 responsable_tipo: "interno"
 *                 responsable_usuario_id: 5
 *                 responsable_proveedor_id: null
 *                 duracion_estimada_horas: 2.5
 *                 costo_estimado: 150000
 *                 observaciones: "Revisar tableros principales"
 *                 activo: true
 *             crearMasivoExterno:
 *               summary: Creación masiva con proveedor externo
 *               value:
 *                 equipos_ids: [4, 5, 6, 7]
 *                 plan_id: 1
 *                 categoria_id: 3
 *                 tipo_mantenimiento_id: 2
 *                 nombre: "Calibración de equipos de medición"
 *                 descripcion: "Calibración y certificación de equipos"
 *                 sede_id: 2
 *                 periodicidad_id: 5
 *                 responsable_tipo: "externo"
 *                 responsable_usuario_id: null
 *                 responsable_proveedor_id: 8
 *                 duracion_estimada_horas: 4
 *                 costo_estimado: 500000
 *                 observaciones: null
 *                 activo: true
 *     responses:
 *       201:
 *         description: Actividades creadas exitosamente
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
 *                   example: "3 actividades creadas exitosamente en grupo ACT-GRUPO-20240121-143025-A3F2"
 *                 grupo_masivo_id:
 *                   type: string
 *                   description: Identificador único del grupo de actividades creadas
 *                   example: "ACT-GRUPO-20240121-143025-A3F2"
 *                 cantidad:
 *                   type: integer
 *                   description: Número de actividades creadas
 *                   example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 15
 *                       plan_id:
 *                         type: integer
 *                         example: 1
 *                       categoria_id:
 *                         type: integer
 *                         example: 2
 *                       tipo_mantenimiento_id:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: "Mantenimiento preventivo eléctrico"
 *                       descripcion:
 *                         type: string
 *                         example: "Revisión general del sistema eléctrico"
 *                       sede_id:
 *                         type: integer
 *                         example: 1
 *                       equipo_id:
 *                         type: integer
 *                         example: 1
 *                       periodicidad_id:
 *                         type: integer
 *                         example: 3
 *                       responsable_tipo:
 *                         type: string
 *                         example: "interno"
 *                       responsable_usuario_id:
 *                         type: integer
 *                         example: 5
 *                       responsable_proveedor_id:
 *                         type: integer
 *                         nullable: true
 *                         example: null
 *                       duracion_estimada_horas:
 *                         type: number
 *                         example: 2.5
 *                       costo_estimado:
 *                         type: number
 *                         example: 150000
 *                       observaciones:
 *                         type: string
 *                         example: "Revisar tableros principales"
 *                       activo:
 *                         type: boolean
 *                         example: true
 *                       grupo_masivo_id:
 *                         type: string
 *                         example: "ACT-GRUPO-20240121-143025-A3F2"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-21T14:30:25.000Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-21T14:30:25.000Z"
 *                       plan:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           nombre:
 *                             type: string
 *                             example: "Plan 2024"
 *                           anio:
 *                             type: integer
 *                             example: 2024
 *                       categoria:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 2
 *                           nombre:
 *                             type: string
 *                             example: "Eléctrico"
 *                           color:
 *                             type: string
 *                             example: "#FF5733"
 *                       sede:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           nombre:
 *                             type: string
 *                             example: "Sede Principal"
 *                       equipo:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           codigo:
 *                             type: string
 *                             example: "EQ-001"
 *                           nombre:
 *                             type: string
 *                             example: "Tablero Eléctrico Principal"
 *                       periodicidad:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 3
 *                           nombre:
 *                             type: string
 *                             example: "Trimestral"
 *                           dias:
 *                             type: integer
 *                             example: 90
 *                       responsable_usuario:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 5
 *                           nombre:
 *                             type: string
 *                             example: "Juan"
 *                           apellido:
 *                             type: string
 *                             example: "Pérez"
 *                       responsable_proveedor:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: null
 *                           nombre:
 *                             type: string
 *                             example: null
 *       400:
 *         description: Error de validación
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
 *             examples:
 *               equiposInsuficientes:
 *                 summary: Menos de 2 equipos
 *                 value:
 *                   success: false
 *                   message: "Debe proporcionar al menos 2 equipos para creación masiva"
 *               camposFaltantes:
 *                 summary: Campos requeridos faltantes
 *                 value:
 *                   success: false
 *                   message: "Todos los campos requeridos deben ser proporcionados"
 *               categoriaIncorrecta:
 *                 summary: Equipos de categoría incorrecta
 *                 value:
 *                   success: false
 *                   message: "Los siguientes equipos no pertenecen a la categoría seleccionada: EQ-001, EQ-003"
 *               responsableFaltante:
 *                 summary: Responsable no proporcionado
 *                 value:
 *                   success: false
 *                   message: "Debe proporcionar un responsable usuario para tipo interno"
 *       403:
 *         description: Sin permisos para crear actividades en esta categoría
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
 *                   example: "No tienes permiso para crear actividades en esta categoría"
 *       404:
 *         description: Recurso no encontrado
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
 *             examples:
 *               planNoEncontrado:
 *                 summary: Plan no encontrado
 *                 value:
 *                   success: false
 *                   message: "Plan de mantenimiento no encontrado"
 *               equipoNoEncontrado:
 *                 summary: Uno o más equipos no encontrados
 *                 value:
 *                   success: false
 *                   message: "Uno o más equipos no fueron encontrados"
 *               usuarioNoEncontrado:
 *                 summary: Usuario responsable no encontrado
 *                 value:
 *                   success: false
 *                   message: "Usuario responsable no encontrado"
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
 *                   example: "Error al crear las actividades"
 *                 error:
 *                   type: string
 *                   example: "Database connection error"
 */
router.post('/crear-masivo', requireActividadAccess, planActividadController.crearMasivo);

/**
 * @swagger
 * /api/plan-actividades/grupo/{grupo_masivo_id}:
 *   get:
 *     summary: Obtener todas las actividades de un grupo masivo
 *     description: Retorna todas las actividades que fueron creadas juntas en un lote, identificadas por su grupo_masivo_id
 *     tags: [Plan de Actividades]
 *     parameters:
 *       - in: path
 *         name: grupo_masivo_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador único del grupo masivo
 *         example: "ACT-GRUPO-20240121-143025-A3F2"
 *     responses:
 *       200:
 *         description: Actividades del grupo obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 grupo_masivo_id:
 *                   type: string
 *                   example: "ACT-GRUPO-20240121-143025-A3F2"
 *                 cantidad:
 *                   type: integer
 *                   description: Número de actividades en el grupo
 *                   example: 3
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 15
 *                       plan_id:
 *                         type: integer
 *                         example: 1
 *                       categoria_id:
 *                         type: integer
 *                         example: 2
 *                       tipo_mantenimiento_id:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: "Mantenimiento preventivo eléctrico"
 *                       descripcion:
 *                         type: string
 *                         example: "Revisión general del sistema eléctrico"
 *                       sede_id:
 *                         type: integer
 *                         example: 1
 *                       equipo_id:
 *                         type: integer
 *                         example: 1
 *                       periodicidad_id:
 *                         type: integer
 *                         example: 3
 *                       responsable_tipo:
 *                         type: string
 *                         example: "interno"
 *                       responsable_usuario_id:
 *                         type: integer
 *                         example: 5
 *                       responsable_proveedor_id:
 *                         type: integer
 *                         nullable: true
 *                         example: null
 *                       duracion_estimada_horas:
 *                         type: number
 *                         example: 2.5
 *                       costo_estimado:
 *                         type: number
 *                         example: 150000
 *                       observaciones:
 *                         type: string
 *                         example: "Revisar tableros principales"
 *                       activo:
 *                         type: boolean
 *                         example: true
 *                       grupo_masivo_id:
 *                         type: string
 *                         example: "ACT-GRUPO-20240121-143025-A3F2"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                       plan:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *                           anio:
 *                             type: integer
 *                       categoria:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *                           color:
 *                             type: string
 *                       sede:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *                       equipo:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           codigo:
 *                             type: string
 *                           nombre:
 *                             type: string
 *                       periodicidad:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *                           dias:
 *                             type: integer
 *                       responsable_usuario:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *                           apellido:
 *                             type: string
 *                       responsable_proveedor:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                           nombre:
 *                             type: string
 *       403:
 *         description: Sin permisos para ver estas actividades
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
 *                   example: "No tienes permiso para ver estas actividades"
 *       404:
 *         description: No se encontraron actividades con ese grupo_masivo_id
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
 *                   example: "No se encontraron actividades con ese grupo_masivo_id"
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
 *                   example: "Error al obtener las actividades del grupo"
 *                 error:
 *                   type: string
 */
router.get('/grupo/:grupo_masivo_id', requireActividadAccess, planActividadController.obtenerPorGrupo);

/**
 * @swagger
 * /api/plan-actividades/grupo/{grupo_masivo_id}:
 *   put:
 *     summary: Actualizar todas las actividades de un grupo masivo
 *     description: Actualiza simultáneamente todas las actividades que pertenecen a un grupo. Los equipos asignados a cada actividad NO se modifican. Campos como id, plan_id, equipo_id y grupo_masivo_id no pueden ser actualizados por seguridad.
 *     tags: [Plan de Actividades]
 *     parameters:
 *       - in: path
 *         name: grupo_masivo_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador único del grupo masivo
 *         example: "ACT-GRUPO-20240121-143025-A3F2"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *                 maxLength: 200
 *                 description: Nuevo nombre para las actividades
 *                 example: "Mantenimiento preventivo eléctrico - Actualizado"
 *               descripcion:
 *                 type: string
 *                 description: Nueva descripción
 *                 example: "Revisión completa actualizada del sistema eléctrico"
 *               categoria_id:
 *                 type: integer
 *                 description: Nueva categoría (requiere permisos)
 *                 example: 2
 *               tipo_mantenimiento_id:
 *                 type: integer
 *                 description: Nuevo tipo de mantenimiento
 *                 example: 1
 *               sede_id:
 *                 type: integer
 *                 description: Nueva sede
 *                 example: 1
 *               periodicidad_id:
 *                 type: integer
 *                 description: Nueva periodicidad
 *                 example: 5
 *               responsable_tipo:
 *                 type: string
 *                 enum: [interno, externo]
 *                 description: Nuevo tipo de responsable
 *                 example: "externo"
 *               responsable_usuario_id:
 *                 type: integer
 *                 nullable: true
 *                 description: Nuevo usuario responsable (solo si responsable_tipo es 'interno')
 *                 example: null
 *               responsable_proveedor_id:
 *                 type: integer
 *                 nullable: true
 *                 description: Nuevo proveedor responsable (solo si responsable_tipo es 'externo')
 *                 example: 8
 *               duracion_estimada_horas:
 *                 type: number
 *                 format: decimal
 *                 description: Nueva duración estimada
 *                 example: 3.5
 *               costo_estimado:
 *                 type: number
 *                 format: decimal
 *                 description: Nuevo costo estimado
 *                 example: 200000
 *               observaciones:
 *                 type: string
 *                 description: Nuevas observaciones
 *                 example: "Observaciones actualizadas"
 *               activo:
 *                 type: boolean
 *                 description: Nuevo estado
 *                 example: true
 *           examples:
 *             actualizarResponsable:
 *               summary: Cambiar responsable de interno a externo
 *               value:
 *                 responsable_tipo: "externo"
 *                 responsable_proveedor_id: 8
 *                 responsable_usuario_id: null
 *             actualizarPeriodicidad:
 *               summary: Cambiar periodicidad y costo
 *               value:
 *                 periodicidad_id: 5
 *                 costo_estimado: 250000
 *                 observaciones: "Cambio de periodicidad aprobado"
 *             actualizarCompleto:
 *               summary: Actualización completa
 *               value:
 *                 nombre: "Mantenimiento eléctrico integral"
 *                 descripcion: "Mantenimiento completo con nuevas especificaciones"
 *                 periodicidad_id: 4
 *                 responsable_tipo: "externo"
 *                 responsable_proveedor_id: 10
 *                 responsable_usuario_id: null
 *                 duracion_estimada_horas: 4
 *                 costo_estimado: 300000
 *                 observaciones: "Actualizado según nuevos requisitos"
 *                 activo: true
 *     responses:
 *       200:
 *         description: Grupo actualizado exitosamente
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
 *                   example: "3 actividades actualizadas en el grupo ACT-GRUPO-20240121-143025-A3F2"
 *                 grupo_masivo_id:
 *                   type: string
 *                   example: "ACT-GRUPO-20240121-143025-A3F2"
 *                 cantidad_actualizada:
 *                   type: integer
 *                   description: Número de actividades actualizadas
 *                   example: 3
 *                 data:
 *                   type: array
 *                   description: Actividades actualizadas con sus relaciones
 *                   items:
 *                     type: object
 *       403:
 *         description: Sin permisos para actualizar estas actividades
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
 *             examples:
 *               sinPermisos:
 *                 summary: Sin permisos en categoría actual
 *                 value:
 *                   success: false
 *                   message: "No tienes permiso para modificar estas actividades"
 *               sinPermisosNuevaCategoria:
 *                 summary: Sin permisos en nueva categoría
 *                 value:
 *                   success: false
 *                   message: "No tienes permiso para mover las actividades a esa categoría"
 *       404:
 *         description: Recurso no encontrado
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
 *             examples:
 *               grupoNoEncontrado:
 *                 summary: Grupo no encontrado
 *                 value:
 *                   success: false
 *                   message: "No se encontraron actividades con ese grupo_masivo_id"
 *               categoriaNoEncontrada:
 *                 summary: Categoría no encontrada
 *                 value:
 *                   success: false
 *                   message: "Categoría no encontrada"
 *               usuarioNoEncontrado:
 *                 summary: Usuario responsable no encontrado
 *                 value:
 *                   success: false
 *                   message: "Usuario responsable no encontrado"
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
 *                   example: "Error al actualizar el grupo de actividades"
 *                 error:
 *                   type: string
 */
router.put('/grupo/:grupo_masivo_id', requireActividadAccess, planActividadController.actualizarGrupo);

/**
 * @swagger
 * /api/plan-actividades/grupo/{grupo_masivo_id}:
 *   delete:
 *     summary: Eliminar todas las actividades de un grupo masivo
 *     description: Elimina simultáneamente todas las actividades que pertenecen a un grupo. La operación es atómica (si falla una, se revierten todas). No se puede eliminar si alguna actividad tiene mantenimientos programados asociados.
 *     tags: [Plan de Actividades]
 *     parameters:
 *       - in: path
 *         name: grupo_masivo_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Identificador único del grupo masivo
 *         example: "ACT-GRUPO-20240121-143025-A3F2"
 *     responses:
 *       200:
 *         description: Grupo eliminado exitosamente
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
 *                   example: "3 actividades eliminadas del grupo ACT-GRUPO-20240121-143025-A3F2"
 *                 cantidad_eliminada:
 *                   type: integer
 *                   description: Número de actividades eliminadas
 *                   example: 3
 *       403:
 *         description: Sin permisos para eliminar estas actividades
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
 *                   example: "No tienes permiso para eliminar estas actividades"
 *       404:
 *         description: Grupo no encontrado
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
 *                   example: "No se encontraron actividades con ese grupo_masivo_id"
 *       409:
 *         description: No se puede eliminar porque tiene mantenimientos programados
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
 *                   example: "No se puede eliminar el grupo porque algunas actividades tienen mantenimientos programados"
 *                 actividades_bloqueadas:
 *                   type: array
 *                   description: Lista de actividades que tienen mantenimientos y bloquean la eliminación
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 15
 *                       nombre:
 *                         type: string
 *                         example: "Mantenimiento preventivo eléctrico"
 *                       mantenimientos:
 *                         type: integer
 *                         description: Cantidad de mantenimientos programados asociados
 *                         example: 5
 *             example:
 *               success: false
 *               message: "No se puede eliminar el grupo porque algunas actividades tienen mantenimientos programados"
 *               actividades_bloqueadas:
 *                 - id: 15
 *                   nombre: "Mantenimiento preventivo eléctrico"
 *                   mantenimientos: 5
 *                 - id: 16
 *                   nombre: "Mantenimiento preventivo eléctrico"
 *                   mantenimientos: 3
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
 *                   example: "Error al eliminar el grupo de actividades"
 *                 error:
 *                   type: string
 */
router.delete('/grupo/:grupo_masivo_id', requireActividadAccess, planActividadController.eliminarGrupo);

module.exports = router;