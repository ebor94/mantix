// sv/services/salaError.js — error de negocio de salas de velación (código + HTTP).
class SalaError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'SalaError';
    this.code = code;
    this.status = status;
  }
}

module.exports = SalaError;
