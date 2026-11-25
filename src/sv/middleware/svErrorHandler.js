/**
 * sv/middleware/svErrorHandler.js
 * Último middleware del router de ventas. Responde los errores que los controladores no
 * resolvieron, con el formato de sv/utils/response. El texto interno de un error
 * inesperado queda en el log y no llega al cliente.
 */
const logger = require('../../utils/logger');
const { fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

const ESTADO_POR_CODIGO = new Map([
  ['VALIDATION_ERROR', 422],
  ['NOT_FOUND',        404],
  ['FORBIDDEN',        403],
  ['CONFLICT',         409],
  ['DUPLICATE',        409],
  ['DUPLICATE_PHONE',  409],
  ['DUPLICATE_NIT',    409],
  ['DUPLICATE_EMAIL',  409]
]);

// El manejador global (src/middleware/errorHandler.js) ya traduce estos a mensajes claros.
const DEL_MANEJADOR_GLOBAL = new Set([
  'SequelizeValidationError', 'SequelizeUniqueConstraintError', 'SequelizeDatabaseError', 'MulterError'
]);

function svErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const estado = ESTADO_POR_CODIGO.get(err.code);
  if (estado) return fail(res, estado, err.code, err.message);

  if (DEL_MANEJADOR_GLOBAL.has(err.name)) return next(err);

  logger.error('[SV] Error no controlado', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.baseUrl + req.path // sin la query: puede traer nombres o teléfonos
  });
  return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Error interno. Intenta de nuevo en unos minutos.');
}

module.exports = { svErrorHandler };
