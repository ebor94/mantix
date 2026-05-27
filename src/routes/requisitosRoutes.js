// ============================================
// src/routes/requisitosRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const requisitosController = require('../controllers/requisitosController');
const { 
  auth, 
    authorize,
  requireEquipoAccess, 
  requireCategoriaAccess,
  authWithCategories 
} = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     Requisito:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado del requisito
 *         nombre:
 *           type: string
 *           description: Nombre del requisito
 *         descripcion:
 *           type: string
 *           description: Descripción detallada del requisito
 *         fecha_creacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación del requisito
 *         activo:
 *           type: boolean
 *           description: Estado del requisito (activo/inactivo)
 *           default: true
 *         id_dependencia:
 *           type: integer
 *           description: ID de la dependencia o departamento responsable
 *         categorias:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               nombre:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               color:
 *                 type: string
 *               icono:
 *                 type: string
 *       example:
 *         id: 1
 *         nombre: "Certificado de seguridad"
 *         descripcion: "Certificado vigente de seguridad industrial"
 *         fecha_creacion: "2024-01-08T10:00:00.000Z"
 *         activo: true
 *         id_dependencia: 3
 *         categorias: [
 *           {
 *             id: 1,
 *             nombre: "Equipos Eléctricos",
 *             color: "#3B82F6"
 *           }
 *         ]
 * 
 *     RequisitoInput:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         nombre:
 *           type: string
 *           example: "Certificado de seguridad"
 *         descripcion:
 *           type: string
 *           example: "Certificado vigente de seguridad industrial"
 *         id_dependencia:
 *           type: integer
 *           example: 3
 *         activo:
 *           type: boolean
 *           example: true
 *         categorias:
 *           type: array
 *           items:
 *             type: integer
 *           example: [1, 2, 3]
 *           description: Array de IDs de categorías a asociar
 * 
 *     RequisitoCategoria:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         requisito_id:
 *           type: integer
 *         categoria_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         active:
 *           type: boolean
 *       example:
 *         id: 1
 *         requisito_id: 1
 *         categoria_id: 2
 *         created_at: "2024-01-08T10:00:00.000Z"
 *         active: true
 * 
 *     EstadisticasRequisitos:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 50
 *         activos:
 *           type: integer
 *           example: 45
 *         inactivos:
 *           type: integer
 *           example: 5
 *         por_categoria:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               categoria_id:
 *                 type: integer
 *               total:
 *                 type: integer
 *               categoria.nombre:
 *                 type: string
 */

/**
 * @swagger
 * tags:
 *   - name: Requisitos
 *     description: Gestión de requisitos y documentación necesaria para mantenimientos
 */

/**
 * @swagger
 * /api/requisitos:
 *   get:
 *     summary: Obtener todos los requisitos
 *     description: Retorna la lista completa de requisitos con sus categorías asociadas. Permite filtrar por estado activo y por categoría específica.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: Filtrar por estado activo/inactivo
 *         example: true
 *       - in: query
 *         name: categoria_id
 *         schema:
 *           type: integer
 *         description: Filtrar requisitos de una categoría específica
 *         example: 1
 *     responses:
 *       200:
 *         description: Lista de requisitos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Requisito'
 *       500:
 *         description: Error del servidor
 */
router.get('/', 
  auth, 
  requisitosController.getAll
);

/**
 * @swagger
 * /api/requisitos/estadisticas:
 *   get:
 *     summary: Obtener estadísticas de requisitos
 *     description: Retorna estadísticas generales sobre requisitos (total, activos, inactivos) y distribución por categorías
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EstadisticasRequisitos'
 *       500:
 *         description: Error del servidor
 */
router.get('/estadisticas', 
  auth, 
  requisitosController.getEstadisticas
);

/**
 * @swagger
 * /api/requisitos/categoria/{categoriaId}:
 *   get:
 *     summary: Obtener requisitos por categoría
 *     description: Retorna todos los requisitos asociados a una categoría específica
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoriaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría de mantenimiento
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: Filtrar solo requisitos activos
 *         example: true
 *     responses:
 *       200:
 *         description: Requisitos de la categoría obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Requisito'
 *       500:
 *         description: Error del servidor
 */
router.get('/categoria/:categoriaId', 
  auth, 
  requisitosController.getByCategoriaId
);

/**
 * @swagger
 * /api/requisitos/{id}:
 *   get:
 *     summary: Obtener un requisito por ID
 *     description: Retorna los detalles completos de un requisito específico incluyendo sus categorías asociadas
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     responses:
 *       200:
 *         description: Requisito encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Requisito'
 *       404:
 *         description: Requisito no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', 
  auth, 
  requisitosController.getById
);

/**
 * @swagger
 * /api/requisitos:
 *   post:
 *     summary: Crear un nuevo requisito
 *     description: Crea un nuevo requisito y opcionalmente lo asocia con categorías de mantenimiento
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequisitoInput'
 *     responses:
 *       201:
 *         description: Requisito creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Requisito'
 *       409:
 *         description: Ya existe un requisito con ese nombre
 *       500:
 *         description: Error del servidor
 */
router.post('/', 
  auth,
  authorize,
  requisitosController.create
);

/**
 * @swagger
 * /api/requisitos/{id}:
 *   put:
 *     summary: Actualizar un requisito existente
 *     description: Actualiza los datos de un requisito y sus asociaciones con categorías. Solo administradores.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequisitoInput'
 *     responses:
 *       200:
 *         description: Requisito actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Requisito'
 *       404:
 *         description: Requisito no encontrado
 *       409:
 *         description: El nombre ya está en uso por otro requisito
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', 
  auth,
  authorize,
  requisitosController.update
);

/**
 * @swagger
 * /api/requisitos/{id}:
 *   delete:
 *     summary: Desactivar un requisito (soft delete)
 *     description: Marca el requisito como inactivo sin eliminarlo de la base de datos. Solo administradores.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     responses:
 *       200:
 *         description: Requisito desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Requisito desactivado exitosamente
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Requisito no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', 
  auth,
  authorize,
  requisitosController.delete
);

/**
 * @swagger
 * /api/requisitos/{id}/permanent:
 *   delete:
 *     summary: Eliminar permanentemente un requisito
 *     description: Elimina el requisito completamente de la base de datos. Esta acción no se puede deshacer. Solo super administradores.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     responses:
 *       200:
 *         description: Requisito eliminado permanentemente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Requisito eliminado permanentemente
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Requisito no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id/permanent', 
  auth,
  authorize,
  requisitosController.deletePermanent
);

/**
 * @swagger
 * /api/requisitos/{id}/categorias/asociar:
 *   post:
 *     summary: Asociar requisito con categorías
 *     description: Asocia un requisito con una o más categorías de mantenimiento. Solo administradores.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categorias
 *             properties:
 *               categorias:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *                 description: Array de IDs de categorías a asociar
 *     responses:
 *       200:
 *         description: Categorías asociadas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Requisito'
 *       400:
 *         description: Datos inválidos o categorías no existen
 *       404:
 *         description: Requisito no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/:id/categorias/asociar', 
  auth,
  authorize,
  requisitosController.asociarCategorias
);

/**
 * @swagger
 * /api/requisitos/{id}/categorias/desasociar:
 *   post:
 *     summary: Desasociar requisito de categorías
 *     description: Elimina la asociación entre un requisito y una o más categorías de mantenimiento. Solo administradores.
 *     tags: [Requisitos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del requisito
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categorias
 *             properties:
 *               categorias:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2]
 *                 description: Array de IDs de categorías a desasociar
 *     responses:
 *       200:
 *         description: Categorías desasociadas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Requisito'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Requisito no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/:id/categorias/desasociar', 
  auth,
  authorize,
  requisitosController.desasociarCategorias
);

module.exports = router;