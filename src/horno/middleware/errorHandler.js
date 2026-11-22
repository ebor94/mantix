const logger = require('../../utils/logger');
const HornoError = require('../utils/HornoError');
const { errorParaLog } = require('../../porteria/utils/errorSeguro');

const SIN_CODIGO = 'HOR-SIN-CODIGO';

// Último middleware del router del módulo (y de /api/horno en app.js para errores del parser).
// eslint-disable-next-line no-unused-vars
function hornoErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const codigo = req.hornoApiCodigo || SIN_CODIGO;
  const log = req.hornoLog || logger.child({ modulo: 'horno', api_codigo: codigo });
  if (!res.getHeader('X-HOR-API')) res.setHeader('X-HOR-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof HornoError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; motivo = 'VALIDACION'; message = 'JSON inválido';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; motivo = 'VALIDACION'; message = 'El cuerpo de la solicitud es demasiado grande';
  }

  if (status >= 500) log.error('horno error no controlado', errorParaLog(err));
  else log.warn('horno error', { status, motivo, message });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { hornoErrorHandler, SIN_CODIGO };
