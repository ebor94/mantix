const logger = require('../../utils/logger');
const TrkError = require('../utils/TrkError');

const SIN_CODIGO = 'TRK-SIN-CODIGO';

// Último middleware del router TRK. No toca los manejadores globales de Mantix.
// eslint-disable-next-line no-unused-vars
function trkErrorHandler(err, req, res, next) {
  const codigo = req.trkApiCodigo || SIN_CODIGO;
  const log = req.trkLog || logger.child({ modulo: 'trk', api_codigo: codigo });
  if (!res.getHeader('X-TRK-API')) res.setHeader('X-TRK-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof TrkError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.name === 'MulterError') {
    status = 400;
    motivo = 'VALIDACION';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande' : 'Archivo inválido';
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    motivo = 'VALIDACION';
    message = 'JSON inválido';
  }

  if (status >= 500) log.error('trk error no controlado', { message: err && err.message, stack: err && err.stack });
  else log.warn('trk error', { status, motivo, message });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { trkErrorHandler, SIN_CODIGO };
