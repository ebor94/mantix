const AppError = require('../../utils/AppError');

// Error operativo de Portería: status HTTP + motivo estable + mensaje para el usuario.
class PorteriaError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = PorteriaError;
