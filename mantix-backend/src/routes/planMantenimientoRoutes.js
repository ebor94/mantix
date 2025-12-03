// ============================================
// src/routes/planMantenimientoRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const planMantenimientoController = require('../controllers/planMantenimientoController');

/**
 * @swagger
 * tags:
 *   name: Planes de Mantenimiento
 *   description: API para gestión de planes de mantenimiento
 */

/**
 * @swagger
 * /api/planes-mantenimiento:
 *   get:
 *     summary: Listar planes de mantenimiento
 *     tags: [Planes de Mantenimiento]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Límite de resultados por página
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [activo, inactivo, finalizado]
 *         description: Filtrar por estado
 *       - in: query
 *         name: buscar
 *         schema:
 *           type: string
 *         description: Buscar por nombre o descripción
 *     responses:
 *       200:
 *         description: Lista de planes obtenida exitosamente
 */
router.get('/', planMantenimientoController.listar);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}:
 *   get:
 *     summary: Obtener un plan por ID
 *     tags: [Planes de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan encontrado
 *       404:
 *         description: Plan no encontrado
 */
router.get('/:id', planMantenimientoController.obtenerPorId);

/**
 * @swagger
 * /api/planes-mantenimiento:
 *   post:
 *     summary: Crear un nuevo plan
 *     tags: [Planes de Mantenimiento]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - fecha_inicio
 *             properties:
 *               nombre:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               fecha_inicio:
 *                 type: string
 *                 format: date
 *               fecha_fin:
 *                 type: string
 *                 format: date
 *               responsable_id:
 *                 type: integer
 *               observaciones:
 *                 type: string
 *     responses:
 *       201:
 *         description: Plan creado exitosamente
 */
router.post('/', planMantenimientoController.crear);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}:
 *   put:
 *     summary: Actualizar un plan
 *     tags: [Planes de Mantenimiento]
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
 *     responses:
 *       200:
 *         description: Plan actualizado exitosamente
 */
router.put('/:id', planMantenimientoController.actualizar);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}:
 *   delete:
 *     summary: Eliminar un plan
 *     tags: [Planes de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan eliminado exitosamente
 */
router.delete('/:id', planMantenimientoController.eliminar);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}/toggle:
 *   patch:
 *     summary: Cambiar estado del plan
 *     tags: [Planes de Mantenimiento]
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
 *               - estado
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [activo, inactivo, finalizado]
 *     responses:
 *       200:
 *         description: Estado cambiado exitosamente
 */
router.patch('/:id/toggle', planMantenimientoController.toggleActivo);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}/estadisticas:
 *   get:
 *     summary: Obtener estadísticas del plan
 *     tags: [Planes de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas
 */
router.get('/:id/estadisticas', planMantenimientoController.obtenerEstadisticas);

/**
 * @swagger
 * /api/planes-mantenimiento/{id}/duplicar:
 *   post:
 *     summary: Duplicar un plan
 *     tags: [Planes de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               fecha_inicio:
 *                 type: string
 *                 format: date
 *               fecha_fin:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Plan duplicado exitosamente
 */
router.post('/:id/duplicar', planMantenimientoController.duplicar);

module.exports = router;