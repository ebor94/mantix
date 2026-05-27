// Sedes routes
const express = require('express');
const router = express.Router();
const sedesController = require('../controllers/sedesController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

/**
 * @swagger
 * /api/sedes:
 *   get:
 *     summary: Obtener listado de sedes
 *     description: Devuelve una lista completa de todas las sedes registradas en el sistema, incluyendo información del responsable.
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Listado de sedes obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sede'
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', sedesController.getAll);

/**
 * @swagger
 * /api/sedes/{id}:
 *   get:
 *     summary: Obtener una sede por su ID
 *     description: Devuelve los detalles de una sede específica, incluyendo la información de su responsable.
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico de la sede a obtener.
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Detalles de la sede obtenidos exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sede'
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Sede no encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Sede no encontrada"
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/:id', sedesController.getById);

/**
 * @swagger
 * /api/sedes:
 *   post:
 *     summary: Crear una nueva sede
 *     description: Registra una nueva sede en el sistema con su código único, nombre y datos de contacto.
 *     tags: [Sedes]
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
 *             properties:
 *               codigo:
 *                 type: string
 *                 maxLength: 10
 *                 description: Código único identificador de la sede.
 *                 example: "SED001"
 *               nombre:
 *                 type: string
 *                 maxLength: 100
 *                 description: Nombre de la sede.
 *                 example: "Sede Principal"
 *               direccion:
 *                 type: string
 *                 description: Dirección física de la sede.
 *                 example: "Calle 123 #45-67, Barrio Centro"
 *               ciudad:
 *                 type: string
 *                 maxLength: 100
 *                 description: Ciudad donde se encuentra la sede.
 *                 example: "Cúcuta"
 *               telefono:
 *                 type: string
 *                 maxLength: 20
 *                 pattern: '^\+?[1-9]\d{1,14}$'
 *                 description: Número de teléfono de contacto de la sede.
 *                 example: "+573001234567"
 *               responsable_id:
 *                 type: integer
 *                 description: ID del usuario responsable de la sede.
 *                 example: 2
 *               activo:
 *                 type: boolean
 *                 description: Estado de activación de la sede.
 *                 example: true
 *           examples:
 *             sede_completa:
 *               summary: Sede con todos los datos
 *               value:
 *                 codigo: "SED001"
 *                 nombre: "Sede Principal"
 *                 direccion: "Calle 123 #45-67, Barrio Centro"
 *                 ciudad: "Cúcuta"
 *                 telefono: "+573001234567"
 *                 responsable_id: 2
 *                 activo: true
 *             sede_basica:
 *               summary: Sede con datos mínimos
 *               value:
 *                 codigo: "SED002"
 *                 nombre: "Sede Norte"
 *     responses:
 *       '201':
 *         description: Sede creada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sede'
 *       '400':
 *         description: Error de validación. El responsable especificado no existe.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El responsable especificado no existe"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '409':
 *         description: Conflicto. El código de sede ya está registrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El código de sede ya está registrado"
 *       '500':
 *         description: Error interno del servidor.
 */
router.post('/', sedesController.create);

/**
 * @swagger
 * /api/sedes/{id}:
 *   put:
 *     summary: Actualizar una sede existente
 *     description: Actualiza los datos de una sede específica. Solo se actualizan los campos enviados en el body.
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico de la sede a actualizar.
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
 *                 maxLength: 10
 *                 description: Código único identificador de la sede.
 *                 example: "SED001-UPD"
 *               nombre:
 *                 type: string
 *                 maxLength: 100
 *                 description: Nombre de la sede.
 *                 example: "Sede Principal Actualizada"
 *               direccion:
 *                 type: string
 *                 description: Dirección física de la sede.
 *                 example: "Avenida 456 #78-90, Barrio Norte"
 *               ciudad:
 *                 type: string
 *                 maxLength: 100
 *                 description: Ciudad donde se encuentra la sede.
 *                 example: "Bucaramanga"
 *               telefono:
 *                 type: string
 *                 maxLength: 20
 *                 pattern: '^\+?[1-9]\d{1,14}$'
 *                 description: Número de teléfono de contacto de la sede.
 *                 example: "+573109876543"
 *               responsable_id:
 *                 type: integer
 *                 description: ID del usuario responsable de la sede.
 *                 example: 3
 *               activo:
 *                 type: boolean
 *                 description: Estado de activación de la sede.
 *                 example: true
 *           examples:
 *             actualizacion_completa:
 *               summary: Actualización completa
 *               value:
 *                 codigo: "SED001-UPD"
 *                 nombre: "Sede Principal Actualizada"
 *                 direccion: "Avenida 456 #78-90, Barrio Norte"
 *                 ciudad: "Bucaramanga"
 *                 telefono: "+573109876543"
 *                 responsable_id: 3
 *                 activo: true
 *             actualizacion_parcial:
 *               summary: Actualización parcial
 *               value:
 *                 nombre: "Sede Principal Renovada"
 *                 telefono: "+573109876543"
 *             desactivar_sede:
 *               summary: Desactivar sede
 *               value:
 *                 activo: false
 *     responses:
 *       '200':
 *         description: Sede actualizada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sede'
 *       '400':
 *         description: Error de validación. El responsable especificado no existe.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El responsable especificado no existe"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Sede no encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Sede no encontrada"
 *       '409':
 *         description: Conflicto. El código de sede ya está registrado en otra sede.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El código de sede ya está registrado en otra sede"
 *       '500':
 *         description: Error interno del servidor.
 */
router.put('/:id', sedesController.update);

/**
 * @swagger
 * /api/sedes/{id}:
 *   delete:
 *     summary: Eliminar una sede
 *     description: Elimina permanentemente una sede del sistema. No se puede eliminar si tiene equipos asociados.
 *     tags: [Sedes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico de la sede a eliminar.
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       '200':
 *         description: Sede eliminada exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sede eliminada exitosamente"
 *                 id:
 *                   type: integer
 *                   example: 1
 *       '400':
 *         description: No se puede eliminar la sede porque tiene equipos asociados.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No se puede eliminar la sede porque tiene 5 equipo(s) asociado(s)"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Sede no encontrada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Sede no encontrada"
 *       '500':
 *         description: Error interno del servidor.
 */
router.delete('/:id', sedesController.delete);

module.exports = router;