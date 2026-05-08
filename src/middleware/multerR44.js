// ============================================
// Multer configurado para el módulo R-44
// Archivos guardados fuera del directorio público
// Ruta: ./uploads/r44/{proveedor_id}/{tipo}_{timestamp}.ext
// ============================================
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const TIPOS_PERMITIDOS = {
  rut:    ['application/pdf'],
  camara: ['application/pdf'],
  renta:  ['application/pdf'],
  cedula: ['application/pdf', 'image/jpeg', 'image/png'],
};

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const pid  = req.params.proveedor_id || req.body.proveedor_id || '0';
    const dir  = path.join(process.cwd(), 'uploads', 'r44', String(pid));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase() || '.pdf';
    const tipo = file.fieldname;
    cb(null, `${tipo}_${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const tipo     = file.fieldname;
  const allowed  = TIPOS_PERMITIDOS[tipo];
  if (!allowed) {
    return cb(new Error(`Campo de archivo no reconocido: ${tipo}`));
  }
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error(`Tipo de archivo no permitido para ${tipo}: ${file.mimetype}`));
  }
  cb(null, true);
}

const uploadR44 = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
}).fields([
  { name: 'rut',    maxCount: 1 },
  { name: 'camara', maxCount: 1 },
  { name: 'renta',  maxCount: 1 },
  { name: 'cedula', maxCount: 1 },
]);

module.exports = uploadR44;
