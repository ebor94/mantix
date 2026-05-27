/**
 * sv/controllers/listas.controller.js
 * Carga masiva CSV con multer.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const listas = require('../services/listas.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

// Carpeta de uploads
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/sv');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `lista_${Date.now()}_${file.originalname.replace(/[^\w.-]/g, '_')}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (/csv|text\/plain/.test(file.mimetype) || /\.csv$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo se aceptan archivos CSV'));
  }
});

async function list(req, res) {
  const r = await listas.listar({ scope: req.scope, page: req.query.page, limit: req.query.limit });
  return ok(res, r);
}

async function cargar(req, res) {
  if (!req.file) return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Archivo CSV requerido (campo "archivo")');
  try {
    const lista = await listas.cargarDesdeArchivo({
      filePath:     req.file.path,
      originalName: req.file.originalname,
      areaId:       parseInt(req.body.area_id),
      grupoId:      parseInt(req.body.grupo_id),
      fuenteId:     parseInt(req.body.fuente_id),
      asesorId:     parseInt(req.body.asesor_id),
      nombreLista:  req.body.nombre,
      usuarioId:    req.user.usr_id
    });
    return created(res, lista);
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

async function prospectosDeLista(req, res) {
  const r = await listas.prospectosDeLista(parseInt(req.params.id), { page: req.query.page, limit: req.query.limit });
  return ok(res, r);
}

module.exports = { list, cargar, prospectosDeLista, uploadMiddleware: upload.single('archivo') };
