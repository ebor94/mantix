// Mantenimientos routes
const express = require('express');
const router = express.Router();
const mantenimientosController = require('../controllers/mantenimientosController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);


// Get mantenimientos del día
/**
 * @swagger
 * /api/mantenimientos/dia/hoy:
 *   get:
 *     summary: Obtener mantenimientos del día
 *     description: Devuelve todos los mantenimientos programados para el día actual que están pendientes o en proceso.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Mantenimientos del día obtenidos exitosamente.
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
 *                     $ref: '#/components/schemas/MantenimientoProgramado'
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/dia/hoy', mantenimientosController.obtenerDelDia);

// Get mantenimientos próximos
/**
 * @swagger
 * /api/mantenimientos/proximos:
 *   get:
 *     summary: Obtener mantenimientos próximos
 *     description: Devuelve los mantenimientos programados para los próximos 7 días.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Mantenimientos próximos obtenidos exitosamente.
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
 *                     $ref: '#/components/schemas/MantenimientoProgramado'
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/proximos', mantenimientosController.obtenerProximos);

/**
 * @swagger
 * /api/mantenimientos/atrasados:
 *   get:
 *     summary: Obtener mantenimientos atrasados
 *     description: Devuelve todos los mantenimientos que debieron ejecutarse antes de hoy y aún están pendientes.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Mantenimientos atrasados obtenidos exitosamente.
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
 *                     $ref: '#/components/schemas/MantenimientoProgramado'
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/atrasados', mantenimientosController.obtenerAtrasados);

/**
 * @swagger
 * /api/mantenimientos:
 *   get:
 *     summary: Listar mantenimientos programados
 *     description: Obtiene un listado paginado de mantenimientos programados con opciones de filtrado por sede, estado, fechas, categoría y prioridad.
 *     tags: [Mantenimientos]
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
 *         name: sede_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de sede
 *       - in: query
 *         name: estado_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de estado
 *       - in: query
 *         name: categoria_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de categoría
 *       - in: query
 *         name: prioridad
 *         schema:
 *           type: string
 *           enum: [baja, media, alta, critica]
 *         description: Filtrar por prioridad
 *       - in: query
 *         name: fecha_desde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha inicio del rango (YYYY-MM-DD)
 *         example: "2025-10-01"
 *       - in: query
 *         name: fecha_hasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha fin del rango (YYYY-MM-DD)
 *         example: "2025-10-31"
 *     responses:
 *       '200':
 *         description: Listado de mantenimientos obtenido exitosamente.
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
 *                     $ref: '#/components/schemas/MantenimientoProgramado'
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
 *                       example: 50
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', mantenimientosController.listar);

/**
 * @swagger
 * /api/mantenimientos/{id}:
 *   get:
 *     summary: Obtener mantenimiento por ID
 *     description: Devuelve los detalles completos de un mantenimiento programado, incluyendo información de la actividad, equipo, sede y ejecución si existe.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del mantenimiento programado
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Detalles del mantenimiento obtenidos exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/MantenimientoProgramado'
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Mantenimiento no encontrado.
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
 *                   example: "Registro no encontrado"
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/:id', mantenimientosController.obtenerPorId);

/**
 * @swagger
 * /api/mantenimientos/{id}/reprogramar:
 *   put:
 *     summary: Reprogramar un mantenimiento
 *     description: Cambia la fecha y hora programada de un mantenimiento, incrementa el contador de reprogramaciones y registra el motivo.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del mantenimiento a reprogramar
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
 *               - fecha_programada
 *               - motivo
 *             properties:
 *               fecha_programada:
 *                 type: string
 *                 format: date
 *                 description: Nueva fecha programada
 *                 example: "2025-10-20"
 *               hora_programada:
 *                 type: string
 *                 format: time
 *                 description: Nueva hora programada
 *                 example: "14:00:00"
 *               motivo:
 *                 type: string
 *                 description: Motivo de la reprogramación
 *                 example: "Equipo no disponible por producción prioritaria"
 *           examples:
 *             reprogramacion_basica:
 *               summary: Reprogramación con fecha y motivo
 *               value:
 *                 fecha_programada: "2025-10-20"
 *                 hora_programada: "14:00:00"
 *                 motivo: "Equipo no disponible por producción prioritaria"
 *             reprogramacion_urgente:
 *               summary: Reprogramación por emergencia
 *               value:
 *                 fecha_programada: "2025-10-09"
 *                 hora_programada: "08:00:00"
 *                 motivo: "Falla detectada requiere atención inmediata"
 *     responses:
 *       '200':
 *         description: Mantenimiento reprogramado exitosamente.
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
 *                   example: "Mantenimiento reprogramado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/MantenimientoProgramado'
 *       '400':
 *         description: Datos inválidos.
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Mantenimiento no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.put('/:id/reprogramar', mantenimientosController.reprogramar);

/**
 * @swagger
 * /api/mantenimientos/{id}/ejecucion:
 *   post:
 *     summary: Registrar ejecución de mantenimiento
 *     description: Registra la ejecución de un mantenimiento programado, incluyendo trabajo realizado, checklist, materiales utilizados y evidencias.
 *     tags: [Mantenimientos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID del mantenimiento programado a ejecutar
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
 *               - fecha_ejecucion
 *               - hora_inicio
 *               - trabajo_realizado
 *             properties:
 *               fecha_ejecucion:
 *                 type: string
 *                 format: date
 *                 description: Fecha en que se ejecutó el mantenimiento
 *                 example: "2025-10-15"
 *               hora_inicio:
 *                 type: string
 *                 format: time
 *                 description: Hora de inicio del trabajo
 *                 example: "09:00:00"
 *               hora_fin:
 *                 type: string
 *                 format: time
 *                 description: Hora de finalización del trabajo
 *                 example: "11:30:00"
 *               trabajo_realizado:
 *                 type: string
 *                 description: Descripción detallada del trabajo realizado
 *                 example: "Se realizó inspección completa del compresor, cambio de filtros de aire, lubricación de componentes móviles y ajuste de presión"
 *               observaciones:
 *                 type: string
 *                 description: Observaciones adicionales
 *                 example: "Se detectó desgaste en correa principal, programar cambio en próximo mantenimiento"
 *               costo_real:
 *                 type: number
 *                 format: decimal
 *                 description: Costo real del mantenimiento
 *                 example: 350000.00
 *               trabajadores_cantidad:
 *                 type: integer
 *                 description: Cantidad de trabajadores que participaron
 *                 example: 2
 *               calificacion_servicio:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Calificación del servicio (1-5)
 *                 example: 5
 *               requiere_seguimiento:
 *                 type: boolean
 *                 description: Indica si requiere seguimiento
 *                 example: true
 *               fecha_seguimiento:
 *                 type: string
 *                 format: date
 *                 description: Fecha programada para seguimiento
 *                 example: "2025-11-15"
 *               checklist:
 *                 type: array
 *                 description: Items del checklist verificados
 *                 items:
 *                   type: object
 *                   properties:
 *                     item:
 *                       type: string
 *                       example: "Verificar nivel de aceite"
 *                     completado:
 *                       type: boolean
 *                       example: true
 *                     observacion:
 *                       type: string
 *                       example: "Nivel correcto"
 *               materiales:
 *                 type: array
 *                 description: Materiales utilizados
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "Filtro de aire"
 *                     cantidad:
 *                       type: number
 *                       example: 2
 *                     unidad:
 *                       type: string
 *                       example: "unidades"
 *                     costo:
 *                       type: number
 *                       example: 45000.00
 *               firma_responsable:
 *                 type: string
 *                 description: Firma digital del técnico responsable (base64)
 *                 example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *               firma_recibe:
 *                 type: string
 *                 description: Firma digital de quien recibe (base64)
 *                 example: "data:image/png;base64,iVBORw0KGgoAAAANS..."
 *               nombre_recibe:
 *                 type: string
 *                 description: Nombre de quien recibe el equipo
 *                 example: "Carlos Ramírez"
 *           examples:
 *             ejecucion_completa:
 *               summary: Ejecución completa con todos los datos
 *               value:
 *                 fecha_ejecucion: "2025-10-15"
 *                 hora_inicio: "09:00:00"
 *                 hora_fin: "11:30:00"
 *                 trabajo_realizado: "Inspección completa del compresor, cambio de filtros, lubricación"
 *                 observaciones: "Desgaste en correa principal detectado"
 *                 costo_real: 350000.00
 *                 trabajadores_cantidad: 2
 *                 calificacion_servicio: 5
 *                 requiere_seguimiento: true
 *                 fecha_seguimiento: "2025-11-15"
 *                 checklist:
 *                   - item: "Verificar nivel de aceite"
 *                     completado: true
 *                     observacion: "Nivel correcto"
 *                   - item: "Inspeccionar correas"
 *                     completado: true
 *                     observacion: "Desgaste detectado"
 *                 materiales:
 *                   - nombre: "Filtro de aire"
 *                     cantidad: 2
 *                     unidad: "unidades"
 *                     costo: 45000.00
 *                   - nombre: "Aceite lubricante"
 *                     cantidad: 1
 *                     unidad: "litro"
 *                     costo: 25000.00
 *                 firma_responsable: "data:image/png;base64,iVBORw0KGg..."
 *                 firma_recibe: "data:image/png;base64,iVBORw0KGg..."
 *                 nombre_recibe: "Carlos Ramírez"
 *             ejecucion_basica:
 *               summary: Ejecución con datos mínimos
 *               value:
 *                 fecha_ejecucion: "2025-10-15"
 *                 hora_inicio: "09:00:00"
 *                 hora_fin: "10:00:00"
 *                 trabajo_realizado: "Mantenimiento preventivo estándar realizado"
 *     responses:
 *       '200':
 *         description: Ejecución registrada exitosamente.
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
 *                   example: "Ejecución registrada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/MantenimientoEjecutado'
 *       '400':
 *         description: Datos inválidos.
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Mantenimiento no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/:id/ejecucion', mantenimientosController.registrarEjecucion);

/**
 * @swagger
 * /api/mantenimientos/{id}/pdf:
 *   get:
 *     summary: Generar PDF del mantenimiento
 *     tags: [Mantenimientos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF generado exitosamente
 *       404:
 *         description: Mantenimiento no encontrado
 */
router.get('/:id/pdf', mantenimientosController.generarPDF);

/**
 * @swagger
 * /api/mantenimientos/{id}/pdf/descargar:
 *   get:
 *     summary: Descargar PDF del mantenimiento
 *     tags: [Mantenimientos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: PDF descargado
 */
router.get('/:id/pdf/descargar', mantenimientosController.descargarPDF);

module.exports = router