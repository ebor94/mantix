// ============================================
// src/routes/proveedorRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/ProveedorController');

/**
 * @swagger
 * tags:
 *   name: Proveedores
 *   description: API para gestión de proveedores y sus contactos
 */

/**
 * @swagger
 * /api/proveedores:
 *   get:
 *     summary: Listar todos los proveedores activos
 *     tags: [Proveedores]
 *     responses:
 *       200:
 *         description: Lista de proveedores obtenida exitosamente
 */
router.get('/', proveedoresController.getAll);

/**
 * @swagger
 * /api/proveedores/{id}:
 *   get:
 *     summary: Obtener un proveedor por ID con sus contactos
 *     tags: [Proveedores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Proveedor encontrado
 *       404:
 *         description: Proveedor no encontrado
 */
router.get('/:id', proveedoresController.getById);

/**
 * @swagger
 * /api/proveedores:
 *   post:
 *     summary: Crear un nuevo proveedor con sus contactos
 *     tags: [Proveedores]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - razon_social
 *               - nit
 *             properties:
 *               nombre:
 *                 type: string
 *                 maxLength: 150
 *                 example: "Mantenimientos XYZ S.A.S"
 *               razon_social:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Mantenimientos XYZ Sociedad por Acciones Simplificada"
 *               nit:
 *                 type: string
 *                 maxLength: 50
 *                 example: "900123456-1"
 *               especialidad:
 *                 type: string
 *                 example: "Mantenimiento eléctrico e industrial"
 *               periodicidad_contractual:
 *                 type: string
 *                 example: "Anual"
 *               observaciones:
 *                 type: string
 *               contactos:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                     cargo:
 *                       type: string
 *                     telefono:
 *                       type: string
 *                     email:
 *                       type: string
 *                     es_principal:
 *                       type: boolean
 *     responses:
 *       201:
 *         description: Proveedor creado exitosamente
 *       409:
 *         description: NIT duplicado
 */
router.post('/', proveedoresController.create);

/**
 * @swagger
 * /api/proveedores/{id}:
 *   put:
 *     summary: Actualizar un proveedor y gestionar sus contactos
 *     tags: [Proveedores]
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
 *         description: Proveedor actualizado exitosamente
 *       404:
 *         description: Proveedor no encontrado
 */
router.put('/:id', proveedoresController.update);

/**
 * @swagger
 * /api/proveedores/{id}:
 *   delete:
 *     summary: Desactivar un proveedor (soft delete)
 *     tags: [Proveedores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Proveedor desactivado exitosamente
 *       404:
 *         description: Proveedor no encontrado
 */
router.delete('/:id', proveedoresController.delete);

/**
 * @swagger
 * /api/proveedores/{id}/contactos:
 *   post:
 *     summary: Añadir un contacto a un proveedor existente
 *     tags: [Proveedores]
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
 *               cargo:
 *                 type: string
 *               telefono:
 *                 type: string
 *               email:
 *                 type: string
 *               es_principal:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Contacto añadido exitosamente
 */
router.post('/:id/contactos', proveedoresController.addContact);

/**
 * @swagger
 * /api/proveedores/contactos/{contactoId}:
 *   delete:
 *     summary: Eliminar un contacto específico
 *     tags: [Proveedores]
 *     parameters:
 *       - in: path
 *         name: contactoId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Contacto eliminado exitosamente
 *       404:
 *         description: Contacto no encontrado
 */
router.delete('/contactos/:contactoId', proveedoresController.removeContact);

module.exports = router;