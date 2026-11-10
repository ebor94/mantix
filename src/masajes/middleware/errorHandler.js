// Copia adaptada de src/porteria/middleware/errorHandler.js — si se corrige allá, corregir aquí.
const logger = require('../../utils/logger');
const MasajesError = require('../utils/MasajesError');
const { errorParaLog } = require('../utils/errorSeguro');

const SIN_CODIGO = 'MSJ-SIN-CODIGO';

// Último middleware del router de Masajes (y de /api/masajes en app.js, para errores del parser).
// eslint-disable-next-line no-unused-vars
function masajesErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const codigo = req.msjApiCodigo || SIN_CODIGO;
  const log = req.msjLog || logger.child({ modulo: 'masajes', api_codigo: codigo });
  if (!res.getHeader('X-MSJ-API')) res.setHeader('X-MSJ-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof MasajesError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; motivo = 'VALIDACION'; message = 'JSON inválido';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; motivo = 'VALIDACION'; message = 'El cuerpo de la solicitud es demasiado grande';
  }

  if (status >= 500) log.error('masajes error no controlado', errorParaLog(err));
  else log.warn('masajes error', { status, motivo });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { masajesErrorHandler, SIN_CODIGO };
