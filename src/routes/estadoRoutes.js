// ============================================
// src/routes/estadoRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const estadoController = require('../controllers/estadoController');

/**
 * @swagger
 * components:
 *   schemas:
 *     Estado:
 *       type: object
 *       required:
 *         - nombre
 *         - tipo
 *       properties:
 *         id:
 *           type: integer
 *           description: ID auto-generado del estado
 *           example: 1
 *         nombre:
 *           type: string
 *           maxLength: 50
 *           description: Nombre del estado
 *           example: "Programado"
 *         tipo:
 *           type: string
 *           enum: [mantenimiento, solicitud]
 *           description: Tipo de estado
 *           example: "mantenimiento"
 *         color:
 *           type: string
 *           maxLength: 7
 *           description: Color en formato hexadecimal
 *           example: "#667eea"
 *         orden:
 *           type: integer
 *           description: Orden de visualización
 *           example: 1
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 *     
 *     EstadoInput:
 *       type: object
 *       required:
 *         - nombre
 *         - tipo
 *       properties:
 *         nombre:
 *           type: string
 *           maxLength: 50
 *           example: "Programado"
 *         tipo:
 *           type: string
 *           enum: [mantenimiento, solicitud]
 *           example: "mantenimiento"
 *         color:
 *           type: string
 *           maxLength: 7
 *           example: "#667eea"
 *         orden:
 *           type: integer
 *           example: 1
 *     
 *     ReordenarEstadosInput:
 *       type: object
 *       required:
 *         - estados
 *       properties:
 *         estados:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 example: 1
 *               orden:
 *                 type: integer
 *                 example: 1
 *           example:
 *             - id: 1
 *               orden: 1
 *             - id: 2
 *               orden: 2
 *             - id: 3
 *               orden: 3
 */

/**
 * @swagger
 * tags:
 *   name: Estados
 *   description: API para gestión de estados de mantenimiento y solicitudes
 */

/**
 * @swagger
 * /api/estados:
 *   get:
 *     summary: Obtener todos los estados
 *     tags: [Estados]
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [mantenimiento, solicitud]
 *         description: Filtrar por tipo de estado
 *         example: mantenimiento
 *     responses:
 *       200:
 *         description: Lista de estados obtenida exitosamente
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
 *                     $ref: '#/components/schemas/Estado'
 *       500:
 *         description: Error del servidor
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
 *                   example: "Error al obtener los estados"
 *                 error:
 *                   type: string
 */
router.get('/', estadoController.obtenerTodos);

/**
 * @swagger
 * /api/estados/{id}:
 *   get:
 *     summary: Obtener un estado por ID
 *     tags: [Estados]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del estado
 *         example: 1
 *     responses:
 *       200:
 *         description: Estado encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Estado'
 *       404:
 *         description: Estado no encontrado
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
 *                   example: "Estado no encontrado"
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', estadoController.obtenerPorId);

/**
 * @swagger
 * /api/estados:
 *   post:
 *     summary: Crear un nuevo estado
 *     tags: [Estados]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EstadoInput'
 *           examples:
 *             mantenimiento:
 *               summary: Estado de Mantenimiento
 *               value:
 *                 nombre: "Programado"
 *                 tipo: "mantenimiento"
 *                 color: "#667eea"
 *                 orden: 1
 *             solicitud:
 *               summary: Estado de Solicitud
 *               value:
 *                 nombre: "Pendiente"
 *                 tipo: "solicitud"
 *                 color: "#f6ad55"
 *                 orden: 1
 *     responses:
 *       201:
 *         description: Estado creado exitosamente
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
 *                   example: "Estado creado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/Estado'
 *       400:
 *         description: Datos inválidos o estado duplicado
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
 *                   example: "Ya existe un estado con ese nombre"
 *       500:
 *         description: Error del servidor
 */
router.post('/', estadoController.crear);

/**
 * @swagger
 * /api/estados/{id}:
 *   put:
 *     summary: Actualizar un estado existente
 *     tags: [Estados]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del estado a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EstadoInput'
 *           example:
 *             nombre: "En Proceso"
 *             tipo: "mantenimiento"
 *             color: "#4299e1"
 *             orden: 2
 *     responses:
 *       200:
 *         description: Estado actualizado exitosamente
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
 *                   example: "Estado actualizado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/Estado'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Estado no encontrado
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', estadoController.actualizar);

/**
 * @swagger
 * /api/estados/{id}:
 *   delete:
 *     summary: Eliminar un estado
 *     tags: [Estados]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del estado a eliminar
 *         example: 1
 *     responses:
 *       200:
 *         description: Estado eliminado exitosamente
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
 *                   example: "Estado eliminado exitosamente"
 *       404:
 *         description: Estado no encontrado
 *       409:
 *         description: No se puede eliminar porque está en uso
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
 *                   example: "No se puede eliminar el estado porque está siendo utilizado en otros registros"
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', estadoController.eliminar);

/**
 * @swagger
 * /api/estados/reordenar:
 *   patch:
 *     summary: Reordenar estados
 *     tags: [Estados]
 *     description: Actualiza el orden de visualización de múltiples estados
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReordenarEstadosInput'
 *     responses:
 *       200:
 *         description: Estados reordenados exitosamente
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
 *                   example: "Estados reordenados exitosamente"
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error del servidor
 */
router.patch('/reordenar', estadoController.reordenar);

module.exports = router;