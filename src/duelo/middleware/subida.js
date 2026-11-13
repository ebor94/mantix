const multer = require('multer');
const DueloError = require('../utils/DueloError');

const MAX_BYTES = 10 * 1024 * 1024;
const MENSAJE_GRANDE = 'La foto supera los 10 MB. Elige una más liviana.';

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 3, fields: 30, fieldSize: 20 * 1024 },
}).fields([{ name: 'foto_1', maxCount: 1 }, { name: 'foto_2', maxCount: 1 }, { name: 'foto_3', maxCount: 1 }]);

/** multipart/form-data con hasta tres fotos en memoria; traduce los errores de Multer al contrato. */
function subida(req, res, next) {
  subir(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      const orden = /^foto_([123])$/.exec(err.field || '');
      return next(new DueloError(413, 'FOTO_GRANDE', MENSAJE_GRANDE,
        orden ? { [`companero_${orden[1]}_foto`]: MENSAJE_GRANDE } : undefined));
    }
    return next(new DueloError(400, 'FORMULARIO', 'No pudimos leer el formulario. Inténtalo de nuevo.'));
  });
}

module.exports = { subida, MAX_BYTES };
