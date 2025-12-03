// ============================================
// src/routes/categoriaMantenimientoRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const categoriaMantenimientoController = require('../controllers/categoriaMantenimientoController');
const { auth, requireSuperAdmin } = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     CategoriaMantenimiento:
 *       type: object
 *       required:
 *         - nombre
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado de la categoría
 *           example: 1
 *         nombre:
 *           type: string
 *           maxLength: 100
 *           description: Nombre de la categoría
 *           example: "Mantenimiento Preventivo"
 *         descripcion:
 *           type: string
 *           description: Descripción detallada de la categoría
 *           example: "Actividades de mantenimiento programadas para prevenir fallas"
 *         color:
 *           type: string
 *           maxLength: 7
 *           description: Color en formato hexadecimal
 *           example: "#667eea"
 *         icono:
 *           type: string
 *           maxLength: 50
 *           description: Nombre del icono
 *           example: "tools"
 *         activo:
 *           type: boolean
 *           description: Estado de la categoría
 *           example: true
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 */

/**
 * @swagger
 * tags:
 *   name: Categorías de Mantenimiento
 *   description: API para gestión de categorías de mantenimiento
 */

// Todas las rutas requieren autenticación
router.use(auth);

/**
 * @swagger
 * /api/categorias-mantenimiento:
 *   get:
 *     summary: Obtener todas las categorías de mantenimiento (filtradas por permisos)
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Lista de categorías obtenida exitosamente
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/', categoriaMantenimientoController.obtenerTodas);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}:
 *   get:
 *     summary: Obtener una categoría por ID
 *     tags: [Categorías de Mantenimiento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la categoría
 *     responses:
 *       200:
 *         description: Categoría encontrada
 *       403:
 *         description: No tienes permiso para ver esta categoría
 *       404:
 *         description: Categoría no encontrada
 */
router.get('/:id', categoriaMantenimientoController.obtenerPorId);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}/usuarios:
 *   get:
 *     summary: Obtener usuarios asignados a una categoría
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Lista de usuarios obtenida exitosamente
 *       403:
 *         description: No tienes permiso
 *       404:
 *         description: Categoría no encontrada
 */
router.get('/:id/usuarios', categoriaMantenimientoController.obtenerUsuariosAsignados);

/**
 * @swagger
 * /api/categorias-mantenimiento:
 *   post:
 *     summary: Crear una nueva categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
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
 *               descripcion:
 *                 type: string
 *               color:
 *                 type: string
 *               icono:
 *                 type: string
 *     responses:
 *       201:
 *         description: Categoría creada exitosamente
 *       403:
 *         description: Solo super admins pueden crear categorías
 */
router.post('/', requireSuperAdmin, categoriaMantenimientoController.crear);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}:
 *   put:
 *     summary: Actualizar una categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Categoría actualizada exitosamente
 *       403:
 *         description: Solo super admins pueden actualizar categorías
 *       404:
 *         description: Categoría no encontrada
 */
router.put('/:id', requireSuperAdmin, categoriaMantenimientoController.actualizar);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}/toggle:
 *   patch:
 *     summary: Activar/desactivar una categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Solo super admins pueden cambiar el estado
 */
router.patch('/:id/toggle', requireSuperAdmin, categoriaMantenimientoController.toggleActivo);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}:
 *   delete:
 *     summary: Desactivar una categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Categoría desactivada exitosamente
 *       403:
 *         description: Solo super admins pueden desactivar categorías
 */
router.delete('/:id', requireSuperAdmin, categoriaMantenimientoController.eliminar);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}/permanente:
 *   delete:
 *     summary: Eliminar permanentemente una categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
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
 *         description: Categoría eliminada permanentemente
 *       403:
 *         description: Solo super admins pueden eliminar categorías
 */
router.delete('/:id/permanente', requireSuperAdmin, categoriaMantenimientoController.eliminarPermanente);

/**
 * @swagger
 * /api/categorias-mantenimiento/{id}/usuarios:
 *   post:
 *     summary: Asignar usuarios a una categoría (solo super admin)
 *     tags: [Categorías de Mantenimiento]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - usuarios_ids
 *             properties:
 *               usuarios_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *     responses:
 *       200:
 *         description: Usuarios asignados exitosamente
 *       403:
 *         description: Solo super admins pueden asignar usuarios
 */
router.post('/:id/usuarios', requireSuperAdmin, categoriaMantenimientoController.asignarUsuarios);

module.exports = router;