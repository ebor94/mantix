const AppError = require('../../utils/AppError');

// Error operativo del módulo Horno: status HTTP + motivo estable + mensaje para el usuario.
class HornoError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = HornoError;
