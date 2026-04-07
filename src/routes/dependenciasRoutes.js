// ============================================
// src/routes/dependenciasRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const dependenciasController = require('../controllers/dependenciasController');
const { auth, requireSuperAdmin } = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     Dependencia:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado de la dependencia
 *         nombre:
 *           type: string
 *           maxLength: 45
 *           description: Nombre de la dependencia
 *         descripcion:
 *           type: string
 *           maxLength: 45
 *           description: Descripción de la dependencia
 *         fecha_creacion:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         activo:
 *           type: boolean
 *           description: Estado de la dependencia
 *           default: true
 *       example:
 *         id: 1
 *         nombre: "Recursos Humanos"
 *         descripcion: "Departamento de RRHH"
 *         fecha_creacion: "2024-01-08T10:00:00.000Z"
 *         activo: true
 */

/**
 * @swagger
 * tags:
 *   - name: Dependencias
 *     description: Gestión de dependencias o departamentos
 */

/**
 * @swagger
 * /api/dependencias:
 *   get:
 *     summary: Obtener todas las dependencias
 *     description: Retorna la lista de dependencias con opción de filtrar por estado
 *     tags: [Dependencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: activo
 *         schema:
 *           type: boolean
 *         description: Filtrar por estado activo/inactivo
 *         example: true
 *     responses:
 *       200:
 *         description: Lista de dependencias obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dependencia'
 *       500:
 *         description: Error del servidor
 */
router.get('/', 
  auth, 
  dependenciasController.getAll
);

/**
 * @swagger
 * /api/dependencias/{id}:
 *   get:
 *     summary: Obtener una dependencia por ID
 *     description: Retorna los detalles de una dependencia específica
 *     tags: [Dependencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la dependencia
 *     responses:
 *       200:
 *         description: Dependencia encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dependencia'
 *       404:
 *         description: Dependencia no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', 
  auth, 
  dependenciasController.getById
);

/**
 * @swagger
 * /api/dependencias:
 *   post:
 *     summary: Crear una nueva dependencia
 *     description: Crea una nueva dependencia o departamento. Solo administradores.
 *     tags: [Dependencias]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: "Mantenimiento"
 *               descripcion:
 *                 type: string
 *                 example: "Departamento de Mantenimiento"
 *               activo:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Dependencia creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dependencia'
 *       409:
 *         description: Ya existe una dependencia con ese nombre
 *       500:
 *         description: Error del servidor
 */
router.post('/', 
  auth,

  dependenciasController.create
);

/**
 * @swagger
 * /api/dependencias/{id}:
 *   put:
 *     summary: Actualizar una dependencia
 *     description: Actualiza los datos de una dependencia existente. Solo administradores.
 *     tags: [Dependencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la dependencia
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               activo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Dependencia actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dependencia'
 *       404:
 *         description: Dependencia no encontrada
 *       409:
 *         description: El nombre ya está en uso
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', 
  auth,

  dependenciasController.update
);

/**
 * @swagger
 * /api/dependencias/{id}:
 *   delete:
 *     summary: Desactivar una dependencia
 *     description: Marca la dependencia como inactiva (soft delete). Solo administradores.
 *     tags: [Dependencias]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la dependencia
 *     responses:
 *       200:
 *         description: Dependencia desactivada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Dependencia desactivada exitosamente
 *                 id:
 *                   type: integer
 *                   example: 1
 *       404:
 *         description: Dependencia no encontrada
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', 
  auth,

  dependenciasController.delete
);

module.exports = router;