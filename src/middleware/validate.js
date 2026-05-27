const AppError = require('../utils/AppError');

/**
 * Middleware para validar datos con schemas de Joi
 * @param {Object} schema - Schema de Joi para validar
 * @returns {Function} Middleware de Express
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Retorna todos los errores, no solo el primero
      stripUnknown: true, // Elimina campos no definidos en el schema
      convert: true // Convierte tipos automáticamente
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Error de validación en los datos enviados',
        errors
      });
    }

    // Reemplaza req.body con los datos validados y sanitizados
    req.body = value;
    next();
  };
};

module.exports = validate;