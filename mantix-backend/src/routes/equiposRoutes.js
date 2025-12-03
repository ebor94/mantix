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

module.exports = router;