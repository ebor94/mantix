// ============================================
// src/middleware/upload.js - Manejo de Archivos
// ============================================
const multer = require('multer');
const path = require('path');
const { sanitizarNombreArchivo } = require('../utils/helpers');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = sanitizarNombreArchivo(path.basename(file.originalname, ext));
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,pdf').split(',');
  const ext = path.extname(file.originalname).substring(1).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido. Tipos permitidos: ${allowedTypes.join(', ')}`), false);
  }
};

// Límite de tamaño por archivo. Se acepta MAX_FILE_SIZE (en bytes) por
// compatibilidad; si no, MAX_FILE_SIZE_MB (en MB, lo que hay en el .env);
// por defecto 10 MB. Antes se leía solo MAX_FILE_SIZE y, como el .env define
// MAX_FILE_SIZE_MB, el límite efectivo caía al default viejo de 5 MB y las
// fotos/PDF de celular (> 5 MB) fallaban con "file too large".
const maxFileSizeBytes = process.env.MAX_FILE_SIZE
  ? parseInt(process.env.MAX_FILE_SIZE, 10)
  : (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10) * 1024 * 1024;

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeBytes
  }
});

module.exports = upload;