const express = require('express');
const Joi = require('joi');
const multer = require('multer');
const TrkError = require('../utils/TrkError');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const { ESTADOS } = require('../config/constantes');
const ctrl = require('../controllers/participantes.controller');

const esquemaListado = Joi.object({
  categoria: Joi.number().integer().positive(),
  estado: Joi.string().valid(...Object.values(ESTADOS)),
  q: Joi.string().trim().max(100).allow('')
});
const esquemaId = Joi.object({ id: Joi.string().guid({ version: 'uuidv4' }).required() });

const router = express.Router();
router.get('/', apiCodigo('TRK-PAR-001'), trkAuth, validar(esquemaListado, 'query'), aw(ctrl.listar));
router.get('/:id', apiCodigo('TRK-PAR-002'), trkAuth, validar(esquemaId, 'params'), aw(ctrl.obtener));

const telefono = Joi.string().pattern(/^\d{7,10}$/);
const esquemaAlta = Joi.object({
  responsable_nombre: Joi.string().trim().min(2).max(150).required(),
  responsable_telefono: telefono.required(),
  responsable_documento: Joi.string().pattern(/^\d{4,20}$/).allow(null, ''),
  responsable_correo: Joi.string().email().allow(null, ''),
  mascota_nombre: Joi.string().trim().min(1).max(100).required(),
  especie: Joi.string().valid('PERRO', 'GATO').required(),
  categoria_id: Joi.number().integer().positive().required(),
  raza: Joi.string().trim().max(100).allow(null, ''),
  edad_texto: Joi.string().trim().max(50).allow(null, ''),
  sexo: Joi.string().valid('MACHO', 'HEMBRA').allow(null),
  disfraz_nombre: Joi.string().trim().max(150).allow(null, '')
});
const esquemaEdicion = Joi.object({
  mascota_nombre: Joi.string().trim().min(1).max(100),
  disfraz_nombre: Joi.string().trim().max(150).allow(null, ''),
  raza: Joi.string().trim().max(100).allow(null, ''),
  edad_texto: Joi.string().trim().max(50).allow(null, ''),
  sexo: Joi.string().valid('MACHO', 'HEMBRA').allow(null),
  especie: Joi.string().valid('PERRO', 'GATO').allow(null),
  categoria_id: Joi.number().integer().positive(),
  responsable_telefono: telefono.allow(null, ''),
  responsable_correo: Joi.string().email().allow(null, ''),
  responsable_nombre: Joi.string().trim().min(2).max(150),
  responsable_documento: Joi.string().pattern(/^\d{4,20}$/).allow(null),
  autoriza_datos: Joi.boolean(),
  autoriza_reglamento: Joi.boolean(),
  foto_inscripcion_url: Joi.string().uri().max(500).allow(null, '')
}).min(1);
const esquemaEstado = Joi.object({ estado: Joi.string().valid('AUSENTE', 'INSCRITO').required() });

router.post('/', apiCodigo('TRK-PAR-003'), trkAuth, trkPermiso('cabina'), validar(esquemaAlta), aw(ctrl.crear));
router.patch('/:id', apiCodigo('TRK-PAR-004'), trkAuth, trkPermiso('cabina'), validar(esquemaId, 'params'), validar(esquemaEdicion), aw(ctrl.editar));
router.patch('/:id/estado', apiCodigo('TRK-PAR-008'), trkAuth, trkPermiso('cabina'), validar(esquemaId, 'params'), validar(esquemaEstado), aw(ctrl.cambiarEstado));

const subidaFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const valido = /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype);
    cb(valido ? null : new TrkError(400, 'VALIDACION', 'Solo se permiten imágenes JPG, PNG, WEBP o HEIC'), valido);
  }
});

router.post('/:id/foto', apiCodigo('TRK-PAR-005'), trkAuth, trkPermiso('cabina'), validar(esquemaId, 'params'), subidaFoto.single('foto'), aw(ctrl.subirFoto));

module.exports = { prefijo: '/participantes', router, esquemaId };
