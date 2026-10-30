const logger = require('../../utils/logger');
const PorteriaError = require('../utils/PorteriaError');
const { errorParaLog } = require('../../trk/utils/errorSeguro');

const SIN_CODIGO = 'POR-SIN-CODIGO';

// Último middleware del router de Portería (y de /api/porteria en app.js para errores del parser).
// eslint-disable-next-line no-unused-vars
function porteriaErrorHandler(err, req, res, next) {
  const codigo = req.porApiCodigo || SIN_CODIGO;
  const log = req.porLog || logger.child({ modulo: 'porteria', api_codigo: codigo });
  if (!res.getHeader('X-POR-API')) res.setHeader('X-POR-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof PorteriaError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; motivo = 'VALIDACION'; message = 'JSON inválido';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; motivo = 'VALIDACION'; message = 'El cuerpo de la solicitud es demasiado grande';
  }

  if (status >= 500) log.error('porteria error no controlado', errorParaLog(err));
  else log.warn('porteria error', { status, motivo, message });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { porteriaErrorHandler, SIN_CODIGO };
