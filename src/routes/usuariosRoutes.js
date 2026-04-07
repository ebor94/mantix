// Usuarios routes
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { auth } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Obtener listado de usuarios
 *     description: Devuelve una lista completa de todos los usuarios registrados en el sistema, incluyendo la información de su rol.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Listado de usuarios obtenido exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   nombre:
 *                     type: string
 *                     example: "Juan"
 *                   apellido:
 *                     type: string
 *                     example: "Pérez"
 *                   email:
 *                     type: string
 *                     format: email
 *                     example: "juan.perez@example.com"
 *                   telefono:
 *                     type: string
 *                     example: "+573001234567"
 *                   avatar:
 *                     type: string
 *                     format: uri
 *                     example: "https://example.com/avatar.png"
 *                   activo:
 *                     type: boolean
 *                     example: true
 *                   ultimo_acceso:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-10-08T14:20:50.000Z"
 *                   rol:
 *                     type: object
 *                     properties:
 *                       nombre:
 *                         type: string
 *                         example: "Administrador"
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-10-08T12:00:00.000Z"
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-10-08T12:00:00.000Z"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/', usuariosController.getAll);


/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Obtener un usuario por su ID
 *     description: Devuelve los detalles de un usuario específico, incluyendo la información de su rol.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico del usuario a obtener.
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Detalles del usuario obtenidos exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 nombre:
 *                   type: string
 *                   example: "Juan"
 *                 apellido:
 *                   type: string
 *                   example: "Pérez"
 *                 email:
 *                   type: string
 *                   format: email
 *                   example: "juan.perez@example.com"
 *                 telefono:
 *                   type: string
 *                   example: "+573001234567"
 *                 avatar:
 *                   type: string
 *                   format: uri
 *                   example: "https://example.com/avatar.png"
 *                 activo:
 *                   type: boolean
 *                   example: true
 *                 ultimo_acceso:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T14:20:50.000Z"
 *                 rol:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "Administrador"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T12:00:00.000Z"
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T12:00:00.000Z"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Usuario no encontrado.
 *       '500':
 *         description: Error interno del servidor.
 */
router.get('/:id', usuariosController.getById);

/**
 * @swagger
 *   /api/usuarios:
 *   post:
 *     summary: Crear un nuevo usuario
 *     description: Registra un nuevo usuario en el sistema. La contraseña se hashea automáticamente antes de almacenarse en la base de datos.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rol_id
 *               - nombre
 *               - apellido
 *               - email
 *               - password
 *             properties:
 *               rol_id:
 *                 type: integer
 *                 description: ID del rol al que pertenecerá el usuario.
 *                 example: 2
 *               nombre:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: Nombre del usuario.
 *                 example: "Ana"
 *               apellido:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: Apellido del usuario.
 *                 example: "García"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico único del usuario.
 *                 example: "ana.garcia@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Contraseña del usuario (mínimo 8 caracteres, debe incluir mayúsculas, minúsculas y números).
 *                 example: "Password123!"
 *               telefono:
 *                 type: string
 *                 pattern: '^\+?[1-9]\d{1,14}$'
 *                 description: Número de teléfono del usuario (formato internacional).
 *                 example: "+573109876543"
 *               avatar:
 *                 type: string
 *                 format: uri
 *                 description: URL de la imagen de perfil del usuario.
 *                 example: "https://example.com/avatar_ana.png"
 *     responses:
 *       '201':
 *         description: Usuario creado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 5
 *                 rol_id:
 *                   type: integer
 *                   example: 2
 *                 nombre:
 *                   type: string
 *                   example: "Ana"
 *                 apellido:
 *                   type: string
 *                   example: "García"
 *                 email:
 *                   type: string
 *                   example: "ana.garcia@example.com"
 *                 telefono:
 *                   type: string
 *                   example: "+573109876543"
 *                 avatar:
 *                   type: string
 *                   example: "https://example.com/avatar_ana.png"
 *                 activo:
 *                   type: boolean
 *                   example: true
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T15:30:00.000Z"
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T15:30:00.000Z"
 *       '400':
 *         description: Error de validación. Los datos enviados no cumplen con los requisitos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El email es requerido y debe ser válido"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '409':
 *         description: Conflicto. El correo electrónico ya está registrado en el sistema.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El email ana.garcia@example.com ya está registrado"
 *       '500':
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error al crear el usuario"
 */
router.post('/', usuariosController.create);


/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Actualizar un usuario existente
 *     description: Actualiza los datos de un usuario específico. Solo se actualizan los campos enviados en el body. La contraseña se hashea automáticamente si se proporciona.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID numérico del usuario a actualizar.
 *         schema:
 *           type: integer
 *           example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rol_id:
 *                 type: integer
 *                 description: ID del rol al que pertenecerá el usuario.
 *                 example: 3
 *               nombre:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Nombre del usuario.
 *                 example: "Ana María"
 *               apellido:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Apellido del usuario.
 *                 example: "García López"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 150
 *                 description: Correo electrónico único del usuario.
 *                 example: "ana.garcia.updated@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 255
 *                 description: Nueva contraseña del usuario (mínimo 8 caracteres, debe incluir mayúsculas, minúsculas y números).
 *                 example: "NewPassword123!"
 *               telefono:
 *                 type: string
 *                 maxLength: 20
 *                 pattern: '^\+?[1-9]\d{1,14}$'
 *                 description: Número de teléfono del usuario (formato internacional).
 *                 example: "+573209876543"
 *               avatar:
 *                 type: string
 *                 format: uri
 *                 maxLength: 255
 *                 description: URL de la imagen de perfil del usuario.
 *                 example: "https://example.com/avatar_ana_updated.png"
 *               activo:
 *                 type: boolean
 *                 description: Estado de activación del usuario.
 *                 example: true
 *           examples:
 *             actualizacion_completa:
 *               summary: Actualización completa
 *               value:
 *                 rol_id: 3
 *                 nombre: "Ana María"
 *                 apellido: "García López"
 *                 email: "ana.garcia.updated@example.com"
 *                 password: "NewPassword123!"
 *                 telefono: "+573209876543"
 *                 avatar: "https://example.com/avatar_ana_updated.png"
 *                 activo: true
 *             actualizacion_parcial:
 *               summary: Actualización parcial (solo algunos campos)
 *               value:
 *                 nombre: "Ana María"
 *                 telefono: "+573209876543"
 *             desactivar_usuario:
 *               summary: Desactivar usuario
 *               value:
 *                 activo: false
 *     responses:
 *       '200':
 *         description: Usuario actualizado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 5
 *                 rol_id:
 *                   type: integer
 *                   example: 3
 *                 nombre:
 *                   type: string
 *                   example: "Ana María"
 *                 apellido:
 *                   type: string
 *                   example: "García López"
 *                 email:
 *                   type: string
 *                   example: "ana.garcia.updated@example.com"
 *                 telefono:
 *                   type: string
 *                   example: "+573209876543"
 *                 avatar:
 *                   type: string
 *                   example: "https://example.com/avatar_ana_updated.png"
 *                 activo:
 *                   type: boolean
 *                   example: true
 *                 ultimo_acceso:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T14:20:50.000Z"
 *                 rol:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: "Operador"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T12:00:00.000Z"
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-08T15:45:30.000Z"
 *       '400':
 *         description: Error de validación. Los datos enviados no cumplen con los requisitos o el rol no existe.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El rol especificado no existe"
 *       '401':
 *         description: No autorizado. El token de autenticación no fue proporcionado o es inválido.
 *       '404':
 *         description: Usuario no encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Usuario no encontrado"
 *       '409':
 *         description: Conflicto. El correo electrónico ya está registrado por otro usuario.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El email ya está registrado por otro usuario"
 *       '500':
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error al actualizar el usuario"
 */
router.put('/:id', usuariosController.update);
// Delete user
router.delete('/:id', usuariosController.delete);

module.exports = router;