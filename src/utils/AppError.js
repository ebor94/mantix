class AppError extends Error {
  /**
   * @param {string} message   Mensaje para el usuario.
   * @param {number} statusCode
   * @param {*} [detalles]     Datos estructurados opcionales que el errorHandler
   *                           adjunta a la respuesta. Se usa, por ejemplo, para
   *                           devolver la lista de reglas de convenio que un
   *                           grupo familiar incumple, y que el formulario pueda
   *                           señalar los beneficiarios exactos en vez de
   *                           mostrar un mensaje suelto.
   */
  constructor(message, statusCode, detalles) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    if (detalles !== undefined) this.detalles = detalles;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
