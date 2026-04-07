// ============================================
// src/routes/ejecucionEvidenciaRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const ejecucionEvidenciaController = require('../controllers/ejecucionEvidenciaController');
const multer = require('multer');
const path = require('path');

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/evidencias');

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Aceptar solo imágenes y PDFs
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF) y archivos PDF'));
    }
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     EvidenciaInput:
 *       type: object
 *       required:
 *         - mantenimiento_ejecutado_id
 *         - tipo
 *         - file
 *       properties:
 *         mantenimiento_ejecutado_id:
 *           type: integer
 *           description: ID del mantenimiento ejecutado
 *           example: 1
 *         tipo:
 *           type: string
 *           enum: [antes, durante, despues]
 *           description: Momento de la evidencia
 *           example: "antes"
 *         descripcion:
 *           type: string
 *           description: Descripción de la evidencia
 *           example: "Estado inicial del equipo"
 *         file:
 *           type: string
 *           format: binary
 *           description: Archivo de evidencia (imagen o PDF)
 */

/**
 * @swagger
 * tags:
 *   name: Ejecución Evidencias
 *   description: API para gestión de evidencias fotográficas y documentales de mantenimientos
 */

/**
 * @swagger
 * /api/ejecucion-evidencias/mantenimiento/{mantenimiento_ejecutado_id}:
 *   get:
 *     summary: Obtener evidencias de un mantenimiento ejecutado
 *     tags: [Ejecución Evidencias]
 *     parameters:
 *       - in: path
 *         name: mantenimiento_ejecutado_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del mantenimiento ejecutado
 *         example: 1
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [antes, durante, despues]
 *         description: Filtrar por tipo de evidencia
 *         example: "antes"
 *     responses:
 *       200:
 *         description: Evidencias obtenidas exitosamente
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
 *                     $ref: '#/components/schemas/EjecucionEvidencia'
 *                 agrupadas:
 *                   type: object
 *                   properties:
 *                     antes:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/EjecucionEvidencia'
 *                     durante:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/EjecucionEvidencia'
 *                     despues:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/EjecucionEvidencia'
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 10
 *                     antes:
 *                       type: integer
 *                       example: 3
 *                     durante:
 *                       type: integer
 *                       example: 4
 *                     despues:
 *                       type: integer
 *                       example: 3
 *       500:
 *         description: Error del servidor
 */
router.get('/mantenimiento/:mantenimiento_ejecutado_id', ejecucionEvidenciaController.obtenerPorMantenimiento);

/**
 * @swagger
 * /api/ejecucion-evidencias/{id}:
 *   get:
 *     summary: Obtener una evidencia por ID
 *     tags: [Ejecución Evidencias]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la evidencia
 *         example: 1
 *     responses:
 *       200:
 *         description: Evidencia encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionEvidencia'
 *       404:
 *         description: Evidencia no encontrada
 *       500:
 *         description: Error del servidor
 */
router.get('/:id', ejecucionEvidenciaController.obtenerPorId);

/**
 * @swagger
 * /api/ejecucion-evidencias:
 *   post:
 *     summary: Subir una evidencia
 *     tags: [Ejecución Evidencias]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - mantenimiento_ejecutado_id
 *               - tipo
 *               - file
 *             properties:
 *               mantenimiento_ejecutado_id:
 *                 type: integer
 *                 description: ID del mantenimiento ejecutado
 *                 example: 1
 *               tipo:
 *                 type: string
 *                 enum: [antes, durante, despues]
 *                 description: Momento de la evidencia
 *                 example: "antes"
 *               descripcion:
 *                 type: string
 *                 description: Descripción de la evidencia
 *                 example: "Estado inicial del compresor"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo (imagen o PDF, máx 10MB)
 *     responses:
 *       201:
 *         description: Evidencia subida exitosamente
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
 *                   example: "Evidencia subida exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionEvidencia'
 *       400:
 *         description: Datos inválidos o archivo no válido
 *       404:
 *         description: Mantenimiento no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/', (req, res, next) => {
  console.log('🔍 DEBUG - Request recibida en /api/ejecucion-evidencias');
  console.log('Headers:', req.headers);
  console.log('Body (antes de multer):', req.body);
  next();
}, upload.single('file'), (req, res, next) => {
  console.log('📁 Después de multer:');
  console.log('Body:', req.body);
  console.log('File:', req.file);
  next();
}, ejecucionEvidenciaController.crear);
/**
 * @swagger
 * /api/ejecucion-evidencias/{id}:
 *   put:
 *     summary: Actualizar metadata de una evidencia
 *     tags: [Ejecución Evidencias]
 *     description: Actualiza solo la descripción y tipo, no el archivo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la evidencia
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tipo:
 *                 type: string
 *                 enum: [antes, durante, despues]
 *                 example: "durante"
 *               descripcion:
 *                 type: string
 *                 example: "Proceso de cambio de filtros"
 *     responses:
 *       200:
 *         description: Evidencia actualizada exitosamente
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
 *                   example: "Evidencia actualizada exitosamente"
 *                 data:
 *                   $ref: '#/components/schemas/EjecucionEvidencia'
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Evidencia no encontrada
 *       500:
 *         description: Error del servidor
 */
router.put('/:id', ejecucionEvidenciaController.actualizar);

/**
 * @swagger
 * /api/ejecucion-evidencias/{id}:
 *   delete:
 *     summary: Eliminar una evidencia
 *     tags: [Ejecución Evidencias]
 *     description: Elimina la evidencia y su archivo del servidor
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la evidencia
 *         example: 1
 *     responses:
 *       200:
 *         description: Evidencia eliminada exitosamente
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
 *                   example: "Evidencia eliminada exitosamente"
 *       404:
 *         description: Evidencia no encontrada
 *       500:
 *         description: Error del servidor
 */
router.delete('/:id', ejecucionEvidenciaController.eliminar);

/**
 * @swagger
 * /api/ejecucion-evidencias/{id}/descargar:
 *   get:
 *     summary: Descargar archivo de evidencia
 *     tags: [Ejecución Evidencias]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la evidencia
 *         example: 1
 *     responses:
 *       200:
 *         description: Archivo descargado exitosamente
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Evidencia o archivo no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/:id/descargar', ejecucionEvidenciaController.descargar);

module.exports = router;