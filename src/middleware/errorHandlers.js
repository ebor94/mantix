const AppError = require('../utils/AppError');

function errorHandler(err, req, res, _next) {
  // Sequelize: documento duplicado
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      message: 'Ya existe un registro con ese tipo y número de documento',
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Sequelize: error de validación del modelo
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Error de validación en los datos',
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Error operacional personalizado
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message
    });
  }

  // Error no controlado
  console.error('Error no controlado:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Error interno del servidor'
  });
}

module.exports = errorHandler;
