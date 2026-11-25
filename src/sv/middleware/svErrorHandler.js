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
const DEL_MANEJADOR_GLOBAL = new Set(['SequelizeValidationError', 'SequelizeUniqueConstraintError', 'MulterError']);

// De SequelizeDatabaseError, solo los que culpan a un dato enviado. Una columna que no existe o
// un interbloqueo son fallas del servidor.
const SQL_POR_DATO = new Set([
  'ER_DATA_TOO_LONG', 'ER_BAD_NULL_ERROR', 'ER_WARN_DATA_OUT_OF_RANGE',
  'WARN_DATA_TRUNCATED', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'
]);

function esDelManejadorGlobal(err) {
  if (DEL_MANEJADOR_GLOBAL.has(err.name)) return true;
  if (err.name === 'SequelizeDatabaseError') return SQL_POR_DATO.has(err.parent?.code);
  return err.statusCode >= 400 && err.statusCode < 500; // p. ej. URL mal formada
}

function svErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const estado = ESTADO_POR_CODIGO.get(err.code);
  if (estado) return fail(res, estado, err.code, err.message);

  if (esDelManejadorGlobal(err)) return next(err);

  // "detalle" y no "message": winston reemplazaría la etiqueta con la clave message.
  logger.error('[SV] Error no controlado', {
    detalle: err.message || String(err),
    stack: err.stack,
    method: req.method,
    path: req.baseUrl + req.path // sin la query: puede traer nombres o teléfonos
  });
  return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Error interno. Intenta de nuevo en unos minutos.');
}

module.exports = { svErrorHandler };
