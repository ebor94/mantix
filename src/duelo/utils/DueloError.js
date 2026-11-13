// Error controlado del módulo: el manejador lo convierte en { success:false, motivo, message, errores }.
class DueloError extends Error {
  constructor(statusCode, motivo, message, errores) {
    super(message);
    this.name = 'DueloError';
    this.statusCode = statusCode;
    this.motivo = motivo;
    this.errores = errores;
  }
}

module.exports = DueloError;
