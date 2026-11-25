/**
 * sv/controllers/presupuestos.controller.js — presupuesto contra realizado de un mes.
 * El alcance lo decide el servicio; sus errores los responde svErrorHandler.
 * Cargar (plantilla, revisar, guardar) es de supervisor y administrador de área: el rol se
 * comprueba antes de recibir el archivo.
 */
const path = require('path');
const multer = require('multer');
const presupuestos = require('../services/presupuestos.service');
const { ok, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

const MAX_BYTES = 2 * 1024 * 1024;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname || '').toLowerCase() === '.xlsx') return cb(null, true);
    return cb(Object.assign(new Error('Sube el archivo en formato .xlsx'), { code: 'ARCHIVO_NO_XLSX' }));
  }
}).single('archivo');

async function consultar(req, res) {
  const { area_id: areaId, anio, mes } = req.query;
  return ok(res, await presupuestos.consultar({ user: req.user, areaId, anio, mes }));
}

function soloQuienCarga(req, res, next) {
  if (presupuestos.ROLES_QUE_CARGAN.includes(req.user.rol?.rol_codigo)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'No puedes cargar el presupuesto');
}

// Errores de la subida como 422 con mensaje propio, no el genérico de imágenes del manejador global.
function recibirArchivo(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 2 MB'
      : err.code === 'ARCHIVO_NO_XLSX' ? err.message
        : 'No se pudo recibir el archivo';
    return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, mensaje);
  });
}

async function plantilla(req, res) {
  const { area_id: areaId, anio, mes } = req.query;
  const { buffer, nombre } = await presupuestos.plantilla({ user: req.user, areaId, anio, mes });
  res.set({
    'Content-Type': XLSX,
    'Content-Disposition': `attachment; filename="${nombre}"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store'
  });
  return res.send(buffer);
}

async function revisar(req, res) {
  if (!req.file) return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Falta el archivo');
  const { area_id: areaId, anio, mes } = req.body;
  return ok(res, await presupuestos.revisar({ user: req.user, areaId, anio, mes, buffer: req.file.buffer }));
}

async function guardar(req, res) {
  const { area_id: areaId, anio, mes, filas } = req.body;
  return ok(res, await presupuestos.guardar({ user: req.user, areaId, anio, mes, filas }));
}

module.exports = { consultar, soloQuienCarga, recibirArchivo, plantilla, revisar, guardar };
