const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const apiCodigo = require('../middleware/apiCodigo');
const validar = require('../middleware/validar');
const { trkAuth, trkPermiso } = require('../middleware/trkAuth');
const aw = require('../utils/aw');
const TrkError = require('../utils/TrkError');
const ctrl = require('../controllers/import.controller');

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const valido = /\.csv$/i.test(file.originalname) || /csv|text\/plain/.test(file.mimetype);
    cb(valido ? null : new TrkError(400, 'VALIDACION', 'El archivo debe ser CSV'), valido);
  }
});

const esquemaConfirmar = Joi.object({
  preview_token: Joi.string().hex().length(64).required(),
  decisiones: Joi.object({
    omitir: Joi.array().items(Joi.number().integer().min(0)).default([]),
    conservar: Joi.object().pattern(Joi.string(), Joi.number().integer().min(0)).default({}),
    categoria: Joi.object().pattern(Joi.string().pattern(/^\d+$/), Joi.string().max(20)).default({})
  }).default({})
});

const puedeImportar = [trkAuth, trkPermiso('importar')];
const router = express.Router();
router.post('/preview', apiCodigo('TRK-IMP-001'), ...puedeImportar, subida.single('archivo'), aw(ctrl.preview));
router.post('/confirm', apiCodigo('TRK-IMP-002'), ...puedeImportar, validar(esquemaConfirmar), aw(ctrl.confirmar));

module.exports = { prefijo: '/import', router };
