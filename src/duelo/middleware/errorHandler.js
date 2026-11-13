const logger = require('../../utils/logger');
const DueloError = require('../utils/DueloError');

// Errores de body-parser: su mensaje y `err.body` pueden traer el cuerpo (datos personales); no se registran.
const ERRORES_PARSER = {
  'entity.parse.failed': [400, 'JSON_INVALIDO', 'No pudimos leer la solicitud.'],
  'entity.too.large': [413, 'CUERPO_GRANDE', 'La solicitud es demasiado grande.'],
};

// Último middleware del router de Duelo (y de /api/duelo en app.js para los errores del parser). No
// registra mensajes de error crudos: los de MySQL pueden incluir datos personales (p. ej. la cédula).
// eslint-disable-next-line no-unused-vars
function dueloErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const parser = err && ERRORES_PARSER[err.type];
  if (parser) {
    const [estado, motivo, message] = parser;
    return res.status(estado).json({ success: false, motivo, message });
  }
  if (err instanceof DueloError) {
    const cuerpo = { success: false, motivo: err.motivo, message: err.message };
    if (err.errores) cuerpo.errores = err.errores;
    return res.status(err.statusCode).json(cuerpo);
  }
  logger.error('duelo: error no controlado', { nombre: err && err.name, codigo: err && err.code, ruta: req.path });
  return res.status(500).json({
    success: false, motivo: 'ERROR_INTERNO', message: 'Algo salió mal de nuestro lado. Inténtalo de nuevo en unos minutos.',
  });
}

module.exports = { dueloErrorHandler };
