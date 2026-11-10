const AppError = require('../../utils/AppError');

// Error operativo de Masajes: status HTTP + motivo estable + mensaje para el usuario (mismo contrato que Portería).
class MasajesError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = MasajesError;
