// Solicitudes routes
const express = require('express');
const router = express.Router();
const solicitudesController = require('../controllers/solicitudesController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

/**
 * @swagger
 * /api/solicitudes:
 *   get:
 *     summary: Listar solicitudes de mantenimiento
 *     description: Obtiene un listado paginado de solicitudes con opciones de filtrado por estado, prioridad, tipo y sede.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Cantidad de registros por página
 *       - in: query
 *         name: estado_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de estado
 *         example: 1
 *       - in: query
 *         name: prioridad
 *         schema:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *         description: Filtrar por prioridad
 *         example: "alta"
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [correctivo, preventivo, mejora]
 *         description: Filtrar por tipo de mantenimiento
 *         example: "correctivo"
 *       - in: query
 *         name: sede_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de sede
 *         example: 1
 *     responses:
 *       '200':
 *         description: Listado de solicitudes obtenido exitosamente.
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
 *                     $ref: '#/components/schemas/SolicitudAdicional'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 45
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', solicitudesController.listar);

/**
 * @swagger
 * /api/solicitudes/{id}:
 *   get:
 *     summary: Obtener solicitud por ID
 *     description: Devuelve los detalles completos de una solicitud específica, incluyendo historial de cambios y archivos adjuntos.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Detalles de la solicitud obtenidos exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/SolicitudAdicional'
 *                     - type: object
 *                       properties:
 *                         historial:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               comentario:
 *                                 type: string
 *                                 example: "Solicitud aprobada"
 *                               usuario:
 *                                 type: object
 *                                 properties:
 *                                   nombre:
 *                                     type: string
 *                                     example: "Juan"
 *                                   apellido:
 *                                     type: string
 *                                     example: "Pérez"
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                         archivos:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               nombre_archivo:
 *                                 type: string
 *                               ruta_archivo:
 *                                 type: string
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/:id', solicitudesController.obtenerPorId);

/**
 * @swagger
 * /api/solicitudes:
 *   post:
 *     summary: Crear nueva solicitud de mantenimiento
 *     description: Crea una nueva solicitud de mantenimiento. El usuario autenticado será registrado como solicitante.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sede_id
 *               - categoria_id
 *               - tipo
 *               - prioridad
 *               - titulo
 *               - descripcion
 *             properties:
 *               sede_id:
 *                 type: integer
 *                 description: ID de la sede donde se requiere el mantenimiento
 *                 example: 1
 *               area:
 *                 type: string
 *                 description: Área específica dentro de la sede
 *                 example: "Producción - Línea 2"
 *               categoria_id:
 *                 type: integer
 *                 description: ID de la categoría de mantenimiento
 *                 example: 1
 *               equipo_id:
 *                 type: integer
 *                 description: ID del equipo (opcional si no aplica a equipo específico)
 *                 example: 5
 *               tipo:
 *                 type: string
 *                 enum: [correctivo, preventivo, mejora]
 *                 description: Tipo de mantenimiento requerido
 *                 example: "correctivo"
 *               prioridad:
 *                 type: string
 *                 enum: [baja, media, alta, critica]
 *                 description: Prioridad de la solicitud
 *                 example: "alta"
 *               titulo:
 *                 type: string
 *                 description: Título breve de la solicitud
 *                 example: "Falla en compresor principal"
 *               descripcion:
 *                 type: string
 *                 description: Descripción detallada del problema o necesidad
 *                 example: "El compresor presenta ruidos anormales y pérdida de presión. Se requiere revisión urgente."
 *           examples:
 *             solicitud_correctiva:
 *               summary: Solicitud correctiva urgente
 *               value:
 *                 sede_id: 1
 *                 area: "Producción - Línea 2"
 *                 categoria_id: 1
 *                 equipo_id: 5
 *                 tipo: "correctivo"
 *                 prioridad: "critica"
 *                 titulo: "Falla crítica en compresor"
 *                 descripcion: "El compresor principal se detuvo completamente. Producción paralizada."
 *             solicitud_preventiva:
 *               summary: Solicitud preventiva
 *               value:
 *                 sede_id: 1
 *                 area: "Mantenimiento"
 *                 categoria_id: 2
 *                 equipo_id: 8
 *                 tipo: "preventivo"
 *                 prioridad: "media"
 *                 titulo: "Mantenimiento programado bomba de agua"
 *                 descripcion: "Solicito programación de mantenimiento preventivo según plan anual"
 *             solicitud_mejora:
 *               summary: Solicitud de mejora
 *               value:
 *                 sede_id: 2
 *                 area: "Oficinas"
 *                 categoria_id: 3
 *                 tipo: "mejora"
 *                 prioridad: "baja"
 *                 titulo: "Mejora en sistema de iluminación"
 *                 descripcion: "Se requiere actualizar luminarias por LED para mayor eficiencia"
 *     responses:
 *       '201':
 *         description: Solicitud creada exitosamente.
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
 *                   example: "Registro creado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudAdicional'
 *       '400':
 *         description: Datos inválidos.
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */

router.post('/', solicitudesController.crear);

/**
 * @swagger
 * /api/solicitudes/{id}:
 *   put:
 *     summary: Actualizar solicitud
 *     description: Actualiza los datos de una solicitud existente. Solo campos enviados serán actualizados.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud a actualizar
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sede_id:
 *                 type: integer
 *                 example: 2
 *               area:
 *                 type: string
 *                 example: "Producción - Línea 3"
 *               categoria_id:
 *                 type: integer
 *                 example: 2
 *               equipo_id:
 *                 type: integer
 *                 example: 6
 *               tipo:
 *                 type: string
 *                 enum: [correctivo, preventivo, mejora]
 *                 example: "preventivo"
 *               prioridad:
 *                 type: string
 *                 enum: [baja, media, alta, critica]
 *                 example: "media"
 *               titulo:
 *                 type: string
 *                 example: "Mantenimiento compresor actualizado"
 *               descripcion:
 *                 type: string
 *                 example: "Descripción actualizada con más detalles"
 *           examples:
 *             actualizacion_prioridad:
 *               summary: Cambiar prioridad
 *               value:
 *                 prioridad: "critica"
 *             actualizacion_completa:
 *               summary: Actualización completa
 *               value:
 *                 sede_id: 2
 *                 area: "Producción - Línea 3"
 *                 prioridad: "alta"
 *                 descripcion: "Se actualiza descripción con información adicional del problema"
 *     responses:
 *       '200':
 *         description: Solicitud actualizada exitosamente.
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
 *                   example: "Solicitud actualizada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudAdicional'
 *       '400':
 *         description: Datos inválidos.
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
router.put('/:id', solicitudesController.actualizar);

/**
 * @swagger
 * /api/solicitudes/{id}:
 *   delete:
 *     summary: Eliminar solicitud
 *     description: Elimina permanentemente una solicitud del sistema.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud a eliminar
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Solicitud eliminada exitosamente.
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
 *                   example: "Solicitud eliminada exitosamente"
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */

router.delete('/:id', solicitudesController.eliminar);

/**
 * @swagger
 * /api/solicitudes/{id}/aprobar:
 *   post:
 *     summary: Aprobar solicitud
 *     description: Aprueba una solicitud pendiente, registra quien la aprobó y notifica al solicitante. Se crea un registro en el historial.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud a aprobar
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comentario:
 *                 type: string
 *                 description: Comentario opcional sobre la aprobación
 *                 example: "Solicitud aprobada, proceder con mantenimiento"
 *           examples:
 *             con_comentario:
 *               summary: Aprobación con comentario
 *               value:
 *                 comentario: "Solicitud aprobada, se asignará técnico disponible"
 *             sin_comentario:
 *               summary: Aprobación sin comentario
 *               value: {}
 *     responses:
 *       '200':
 *         description: Solicitud aprobada exitosamente.
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
 *                   example: "Solicitud aprobada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudAdicional'
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/:id/aprobar', solicitudesController.aprobar);

/**
 * @swagger
 * /api/solicitudes/{id}/asignar:
 *   post:
 *     summary: Asignar solicitud
 *     description: Asigna una solicitud a un usuario interno o proveedor externo para su atención. Cambia el estado a "Asignada" y envía notificación.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud a asignar
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               asignado_a_usuario_id:
 *                 type: integer
 *                 description: ID del usuario interno a asignar (excluyente con proveedor)
 *                 example: 4
 *               asignado_a_proveedor_id:
 *                 type: integer
 *                 description: ID del proveedor externo a asignar (excluyente con usuario)
 *                 example: null
 *           examples:
 *             asignar_usuario:
 *               summary: Asignar a técnico interno
 *               value:
 *                 asignado_a_usuario_id: 4
 *             asignar_proveedor:
 *               summary: Asignar a proveedor externo
 *               value:
 *                 asignado_a_proveedor_id: 2
 *     responses:
 *       '200':
 *         description: Solicitud asignada exitosamente.
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
 *                   example: "Solicitud asignada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudAdicional'
 *       '400':
 *         description: Datos inválidos o solicitud ya asignada.
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/:id/asignar', solicitudesController.asignar);

/**
 * @swagger
 * /api/solicitudes/{id}/cerrar:
 *   post:
 *     summary: Cerrar solicitud
 *     description: Cierra una solicitud registrando la solución aplicada, costo y calificación. Cambia el estado a "Resuelta" y notifica al solicitante.
 *     tags: [Solicitudes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la solicitud a cerrar
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - solucion_aplicada
 *             properties:
 *               solucion_aplicada:
 *                 type: string
 *                 description: Descripción de la solución implementada
 *                 example: "Se reemplazó válvula defectuosa, se realizó limpieza completa y ajuste de presión"
 *               costo:
 *                 type: number
 *                 format: decimal
 *                 description: Costo total del trabajo realizado
 *                 example: 450000.00
 *               calificacion:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Calificación del servicio (1-5)
 *                 example: 5
 *               comentario_cierre:
 *                 type: string
 *                 description: Comentario adicional sobre el cierre
 *                 example: "Trabajo realizado satisfactoriamente, equipo operativo al 100%"
 *           examples:
 *             cierre_completo:
 *               summary: Cierre completo con todos los datos
 *               value:
 *                 solucion_aplicada: "Se reemplazó válvula defectuosa, limpieza completa y ajuste de presión"
 *                 costo: 450000.00
 *                 calificacion: 5
 *                 comentario_cierre: "Trabajo realizado satisfactoriamente, equipo operativo"
 *             cierre_basico:
 *               summary: Cierre con datos mínimos
 *               value:
 *                 solucion_aplicada: "Mantenimiento preventivo realizado según protocolo"
 *     responses:
 *       '200':
 *         description: Solicitud cerrada exitosamente.
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
 *                   example: "Solicitud cerrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/SolicitudAdicional'
 *       '400':
 *         description: Datos inválidos o solicitud no puede cerrarse.
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Solicitud no encontrada.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/:id/cerrar', solicitudesController.cerrar);

module.exports = router;