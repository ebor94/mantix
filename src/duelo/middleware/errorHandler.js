const logger = require('../../utils/logger');
const DueloError = require('../utils/DueloError');

// Último middleware del router de Duelo. No registra mensajes de error crudos: los de MySQL pueden
// incluir datos personales (p. ej. la cédula en un duplicado).
// eslint-disable-next-line no-unused-vars
function dueloErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
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
