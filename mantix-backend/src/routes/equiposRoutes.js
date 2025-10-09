// Equipos routes
const express = require('express');
const router = express.Router();
const equiposController = require('../controllers/equiposController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);


/**
 * @swagger
 * /api/equipos:
 *   get:
 *     summary: Obtener listado de equipos
 *     description: Devuelve una lista completa de todos los equipos registrados en el sistema, incluyendo información de categoría, sede y responsable.
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Listado de equipos obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Equipo'
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', equiposController.getAll);

/**
 * @swagger
 * /api/equipos/{id}:
 *   get:
 *     summary: Obtener un equipo por su ID
 *     description: Devuelve los detalles completos de un equipo específico, incluyendo información de categoría, sede y responsable.
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipo'
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Equipo no encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Equipo no encontrado"
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/:id', equiposController.getById);

/**
 * @swagger
 * /api/equipos:
 *   post:
 *     summary: Crear un nuevo equipo
 *     description: Registra un nuevo equipo o máquina en el sistema con toda su información técnica y administrativa.
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
 *                 description: Código único identificador del equipo.
 *                 example: "EQ-001"
 *               nombre:
 *                 type: string
 *                 maxLength: 150
 *                 description: Nombre descriptivo del equipo.
 *                 example: "Compresor de Aire Industrial"
 *               categoria_id:
 *                 type: integer
 *                 description: ID de la categoría de mantenimiento del equipo.
 *                 example: 1
 *               sede_id:
 *                 type: integer
 *                 description: ID de la sede donde se encuentra el equipo.
 *                 example: 1
 *               marca:
 *                 type: string
 *                 maxLength: 100
 *                 description: Marca del equipo.
 *                 example: "Atlas Copco"
 *               modelo:
 *                 type: string
 *                 maxLength: 100
 *                 description: Modelo del equipo.
 *                 example: "GA 55"
 *               numero_serie:
 *                 type: string
 *                 maxLength: 100
 *                 description: Número de serie del equipo.
 *                 example: "AC123456789"
 *               ubicacion_especifica:
 *                 type: string
 *                 description: Ubicación exacta del equipo dentro de la sede.
 *                 example: "Sala de compresores, Planta 2"
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *                 description: Fecha de instalación del equipo.
 *                 example: "2023-01-15"
 *               fecha_compra:
 *                 type: string
 *                 format: date
 *                 description: Fecha de compra del equipo.
 *                 example: "2022-12-01"
 *               valor_compra:
 *                 type: number
 *                 format: decimal
 *                 description: Valor de compra del equipo en COP.
 *                 example: 45000000.00
 *               vida_util_anos:
 *                 type: integer
 *                 description: Vida útil estimada del equipo en años.
 *                 example: 10
 *               responsable_id:
 *                 type: integer
 *                 description: ID del usuario responsable del equipo.
 *                 example: 2
 *               estado:
 *                 type: string
 *                 enum: [operativo, fuera_servicio, en_mantenimiento, dado_baja]
 *                 description: Estado actual del equipo.
 *                 example: "operativo"
 *               observaciones:
 *                 type: string
 *                 description: Observaciones o notas adicionales sobre el equipo.
 *                 example: "Equipo requiere mantenimiento preventivo cada 500 horas"
 *               activo:
 *                 type: boolean
 *                 description: Estado de activación del equipo.
 *                 example: true
 *           examples:
 *             equipo_completo:
 *               summary: Equipo con todos los datos
 *               value:
 *                 codigo: "EQ-001"
 *                 nombre: "Compresor de Aire Industrial"
 *                 categoria_id: 1
 *                 sede_id: 1
 *                 marca: "Atlas Copco"
 *                 modelo: "GA 55"
 *                 numero_serie: "AC123456789"
 *                 ubicacion_especifica: "Sala de compresores, Planta 2"
 *                 fecha_instalacion: "2023-01-15"
 *                 fecha_compra: "2022-12-01"
 *                 valor_compra: 45000000.00
 *                 vida_util_anos: 10
 *                 responsable_id: 2
 *                 estado: "operativo"
 *                 observaciones: "Equipo requiere mantenimiento preventivo cada 500 horas"
 *                 activo: true
 *             equipo_basico:
 *               summary: Equipo con datos mínimos
 *               value:
 *                 codigo: "EQ-002"
 *                 nombre: "Torno CNC"
 *                 categoria_id: 2
 *                 sede_id: 1
 *     responses:
 *       '201':
 *         description: Equipo creado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipo'
 *       '400':
 *         description: Error de validación. La categoría, sede o responsable especificado no existe.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "La categoría especificada no existe"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '409':
 *         description: Conflicto. El código de equipo ya está registrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El código de equipo ya está registrado"
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/', equiposController.create);

/**
 * @swagger
 * /api/equipos/{id}:
 *   put:
 *     summary: Actualizar un equipo existente
 *     description: Actualiza los datos de un equipo específico. Solo se actualizan los campos enviados en el body.
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico del equipo a actualizar.
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
 *               codigo:
 *                 type: string
 *                 maxLength: 50
 *                 example: "EQ-001-UPD"
 *               nombre:
 *                 type: string
 *                 maxLength: 150
 *                 example: "Compresor de Aire Industrial Renovado"
 *               categoria_id:
 *                 type: integer
 *                 example: 2
 *               sede_id:
 *                 type: integer
 *                 example: 2
 *               marca:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Atlas Copco"
 *               modelo:
 *                 type: string
 *                 maxLength: 100
 *                 example: "GA 75"
 *               numero_serie:
 *                 type: string
 *                 maxLength: 100
 *                 example: "AC987654321"
 *               ubicacion_especifica:
 *                 type: string
 *                 example: "Sala de máquinas, Planta 3"
 *               fecha_instalacion:
 *                 type: string
 *                 format: date
 *                 example: "2023-03-20"
 *               fecha_compra:
 *                 type: string
 *                 format: date
 *                 example: "2023-02-15"
 *               valor_compra:
 *                 type: number
 *                 format: decimal
 *                 example: 50000000.00
 *               vida_util_anos:
 *                 type: integer
 *                 example: 12
 *               responsable_id:
 *                 type: integer
 *                 example: 3
 *               estado:
 *                 type: string
 *                 enum: [operativo, fuera_servicio, en_mantenimiento, dado_baja]
 *                 example: "en_mantenimiento"
 *               observaciones:
 *                 type: string
 *                 example: "Equipo en mantenimiento preventivo programado"
 *               activo:
 *                 type: boolean
 *                 example: true
 *           examples:
 *             actualizacion_completa:
 *               summary: Actualización completa
 *               value:
 *                 codigo: "EQ-001-UPD"
 *                 nombre: "Compresor de Aire Industrial Renovado"
 *                 estado: "en_mantenimiento"
 *                 observaciones: "Equipo en mantenimiento preventivo programado"
 *             cambio_estado:
 *               summary: Cambiar estado del equipo
 *               value:
 *                 estado: "fuera_servicio"
 *                 observaciones: "Equipo requiere reparación mayor"
 *             actualizar_ubicacion:
 *               summary: Actualizar ubicación y sede
 *               value:
 *                 sede_id: 2
 *                 ubicacion_especifica: "Bodega de almacenamiento"
 *     responses:
 *       '200':
 *         description: Equipo actualizado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipo'
 *       '400':
 *         description: Error de validación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "La sede especificada no existe"
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Equipo no encontrado.
 *       '409':
 *         description: El código de equipo ya está en uso.
 *       '500':
 *         description: Error interno del servidor.
 */
router.put('/:id', equiposController.update);

/**
 * @swagger
 * /api/equipos/{id}:
 *   delete:
 *     summary: Eliminar un equipo
 *     description: Elimina permanentemente un equipo del sistema.
 *     tags: [Equipos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico del equipo a eliminar.
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Equipo eliminado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Equipo eliminado exitosamente"
 *                 id:
 *                   type: integer
 *                   example: 1
 *       '401':
 *         description: No autorizado.
 *       '404':
 *         description: Equipo no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.delete('/:id', equiposController.delete);

module.exports = router;