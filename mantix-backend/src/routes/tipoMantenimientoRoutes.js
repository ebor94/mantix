// ============================================
// src/routes/tipoMantenimientoRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const tipoMantenimientoController = require('../controllers/Tipomantenimientocontroller');

/**
 * @swagger
 * tags:
 *   name: Tipos de Mantenimiento
 *   description: API para gestión de tipos de mantenimiento
 */

/**
 * @swagger
 * /api/tipos-mantenimiento:
 *   get:
 *     summary: Listar tipos de mantenimiento
 *     tags: [Tipos de Mantenimiento]
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
 *         name: buscar
 *         schema:
 *           type: string
 *         description: Buscar por nombre o descripción
 *       - in: query
 *         name: all
 *         schema:
 *           type: boolean
 *         description: Obtener todos sin paginación
 *     responses:
 *       200:
 *         description: Lista de tipos obtenida exitosamente
 */
router.get('/', tipoMantenimientoController.listar);

/**
 * @swagger
 * /api/tipos-mantenimiento/{id}:
 *   get:
 *     summary: Obtener un tipo por ID
 *     tags: [Tipos de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tipo encontrado
 *       404:
 *         description: Tipo no encontrado
 */
router.get('/:id', tipoMantenimientoController.obtenerPorId);

/**
 * @swagger
 * /api/tipos-mantenimiento:
 *   post:
 *     summary: Crear un nuevo tipo de mantenimiento
 *     tags: [Tipos de Mantenimiento]
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
 *                 maxLength: 50
 *                 example: "Preventivo"
 *               descripcion:
 *                 type: string
 *                 example: "Mantenimiento preventivo programado"
 *     responses:
 *       201:
 *         description: Tipo creado exitosamente
 *       400:
 *         description: Datos inválidos o tipo duplicado
 */
router.post('/', tipoMantenimientoController.crear);

/**
 * @swagger
 * /api/tipos-mantenimiento/{id}:
 *   put:
 *     summary: Actualizar un tipo de mantenimiento
 *     tags: [Tipos de Mantenimiento]
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
 *               - nombre
 *             properties:
 *               nombre:
 *                 type: string
 *                 maxLength: 50
 *               descripcion:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tipo actualizado exitosamente
 *       404:
 *         description: Tipo no encontrado
 *       400:
 *         description: Datos inválidos
 */
router.put('/:id', tipoMantenimientoController.actualizar);

/**
 * @swagger
 * /api/tipos-mantenimiento/{id}:
 *   delete:
 *     summary: Eliminar un tipo de mantenimiento
 *     tags: [Tipos de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tipo eliminado exitosamente
 *       404:
 *         description: Tipo no encontrado
 *       400:
 *         description: No se puede eliminar porque tiene registros asociados
 */
router.delete('/:id', tipoMantenimientoController.eliminar);

/**
 * @swagger
 * /api/tipos-mantenimiento/{id}/estadisticas:
 *   get:
 *     summary: Obtener estadísticas de uso del tipo
 *     tags: [Tipos de Mantenimiento]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas
 *       404:
 *         description: Tipo no encontrado
 */
router.get('/:id/estadisticas', tipoMantenimientoController.obtenerEstadisticas);

module.exports = router;