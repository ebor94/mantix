const AppError = require('../../utils/AppError');

// Error operativo TRK: status HTTP + motivo estable (contrato §9.0) + mensaje para el usuario.
class TrkError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = TrkError;
