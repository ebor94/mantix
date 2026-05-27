// ============================================
// src/routes/ejecucionMaterialRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const ejecucionMaterialController = require('../controllers/ejecucionMaterialController');

/**
 * @swagger
 * components:
 *   schemas:
 *     MaterialInput:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - descripcion
 *         - cantidad
 *       properties:
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         descripcion:
 *           type: string
 *           maxLength: 200
 *           description: Descripción del material
 *           example: "Aceite lubricante SAE 40"
 *         cantidad:
 *           type: number
 *           format: decimal
 *           description: Cantidad utilizada
 *           example: 5.0
 *         unidad:
 *           type: string
 *           maxLength: 20
 *           description: Unidad de medida
 *           example: "litros"
 *         costo_unitario:
 *           type: number
 *           format: decimal
 *           description: Costo por unidad
 *           example: 15000.00
 *         observacion:
 *           type: string
 *           description: Observaciones
 *           example: "Material de stock"
 *     
 *     MaterialMultipleInput:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - materiales
 *       properties:
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           example: 1
 *         materiales:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               descripcion:
 *                 type: string
 *                 example: "Aceite SAE 40"
 *               cantidad:
 *                 type: number
 *                 example: 5.0
 *               unidad:
 *                 type: string
 *                 example: "litros"
 *               costo_unitario:
 *                 type: number
 *                 example: 15000
 *               observacion:
 *                 type: string
 *                 example: ""
 */

/**
 * @swagger
 * tags:
 *   name: Ejecución Materiales
 *   description: API para gestión de materiales utilizados en mantenimientos
 */

/**
 * @swagger
 * /api/ejecucion-materiales/mantenimiento/{mantenimiento_ejecutado_id}:
 *   get:
 *     summary: Obtener materiales de un mantenimiento ejecutado
 *     tags: [Ejecución Materiales]
 *     parameters:
 *       - in: path
 *         name: mantenimiento_ejecutado_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento ejecutado
 *         example: 1
 *     responses:
 *       200:
 *         description: Materiales obtenidos exitosamente
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
 *                     $ref: '#/components/schemas/EjecucionMaterial'
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total_items:
 *                       type: integer
 *                       example: 5
 *                     costo_total:
 *                       type: number
 *                       example: 150000.00
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimiento_ejecutado_id', ejecucionMaterialController.obtenerPorMantenimiento);

/**
 * @swagger
 * /api/ejecucion-materiales/{id}:
 *   get:
 *     summary: Obtener un material por ID
 *     tags: [Ejecución Materiales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del material
 *         example: 1
 *     responses:
 *       200:
 *         description: Material encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionMaterial'
 *       404:
 *         description: Material no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', ejecucionMaterialController.obtenerPorId);

/**
 * @swagger
 * /api/ejecucion-materiales:
 *   post:
 *     summary: Registrar un material
 *     tags: [Ejecución Materiales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaterialInput'
 *           example:
 *             mantenimiento_ejecutado_id: 1
 *             descripcion: "Aceite lubricante SAE 40"
 *             cantidad: 5.0
 *             unidad: "litros"
 *             costo_unitario: 15000
 *             observacion: "Material de stock"
 *     responses:
 *       201:
 *         description: Material registrado exitosamente
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
 *                   example: "Material registrado exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionMaterial'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Mantenimiento no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/', ejecucionMaterialController.crear);

/**
 * @swagger
 * /api/ejecucion-materiales/multiple:
 *   post:
 *     summary: Registrar múltiples materiales
 *     tags: [Ejecución Materiales]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MaterialMultipleInput'
 *           example:
 *             mantenimiento_ejecutado_id: 1
 *             materiales:
 *               - descripcion: "Aceite SAE 40"
 *                 cantidad: 5.0
 *                 unidad: "litros"
 *                 costo_unitario: 15000
 *               - descripcion: "Filtro de aceite"
 *                 cantidad: 1
 *                 unidad: "unidad"
 *                 costo_unitario: 25000
 *               - descripcion: "Grasa industrial"
 *                 cantidad: 2.5
 *                 unidad: "kg"
 *                 costo_unitario: 12000
 *     responses:
 *       201:
 *         description: Materiales registrados exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Mantenimiento no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/multiple', ejecucionMaterialController.crearMultiples);

/**
 * @swagger
 * /api/ejecucion-materiales/{id}:
 *   put:
 *     summary: Actualizar un material
 *     tags: [Ejecución Materiales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del material
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descripcion:
 *                 type: string
 *                 example: "Aceite sintético SAE 40"
 *               cantidad:
 *                 type: number
 *                 example: 6.0
 *               unidad:
 *                 type: string
 *                 example: "litros"
 *               costo_unitario:
 *                 type: number
 *                 example: 18000
 *               observacion:
 *                 type: string
 *                 example: "Cambio a aceite sintético"
 *     responses:
 *       200:
 *         description: Material actualizado exitosamente
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Material no encontrado
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', ejecucionMaterialController.actualizar);

/**
 * @swagger
 * /api/ejecucion-materiales/{id}:
 *   delete:
 *     summary: Eliminar un material
 *     tags: [Ejecución Materiales]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del material
 *         example: 1
 *     responses:
 *       200:
 *         description: Material eliminado exitosamente
 *       404:
 *         description: Material no encontrado
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', ejecucionMaterialController.eliminar);

/**
 * @swagger
 * /api/ejecucion-materiales/resumen/{mantenimiento_ejecutado_id}:
 *   get:
 *     summary: Obtener resumen de costos de materiales
 *     tags: [Ejecución Materiales]
 *     parameters:
 *       - in: path
 *         name: mantenimiento_ejecutado_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento ejecutado
 *         example: 1
 *     responses:
 *       200:
 *         description: Resumen obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_items:
 *                       type: integer
 *                       example: 5
 *                     costo_total:
 *                       type: number
 *                       example: 150000.00
 *                     materiales_por_tipo:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           cantidad_total:
 *                             type: number
 *                             example: 5.0
 *                           costo_total:
 *                             type: number
 *                             example: 75000.00
 *       500:
 *         description: Error del servidor
 */
router.get('/resumen/:mantenimiento_ejecutado_id', ejecucionMaterialController.obtenerResumenCostos);

module.exports = router;