// ============================================
// src/middleware/errorHandler.js
// ============================================
const logger = require('../utils/logger');
const { MENSAJES } = require('../config/constants');

const errorHandler = (err, req, res, next) => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Error de validación de Sequelize
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: MENSAJES.ERROR_VALIDACION,
      errors: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Error de unicidad de Sequelize
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      success: false,
      message: 'El registro ya existe',
      errors: err.errors.map(e => ({
        field: e.path,
        message: `${e.path} ya está en uso`
      }))
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token inválido'
    });
  }

  // Error genérico
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || MENSAJES.ERROR_SERVIDOR
  });
};

module.exports = errorHandler;