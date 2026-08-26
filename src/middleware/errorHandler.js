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

  // Error de multer (subida de archivos): traducir a mensaje claro en español.
  if (err.name === 'MulterError') {
    const maxMb = process.env.MAX_FILE_SIZE
      ? Math.round(parseInt(process.env.MAX_FILE_SIZE, 10) / (1024 * 1024))
      : (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10);
    const mensajes = {
      LIMIT_FILE_SIZE: `El archivo supera el tamaño máximo permitido (${maxMb} MB). Reduce o comprime la imagen/PDF e inténtalo de nuevo.`,
      LIMIT_UNEXPECTED_FILE: 'Se envió un archivo en un campo no permitido.'
    };
    return res.status(400).json({
      success: false,
      message: mensajes[err.code] || `Error al subir el archivo: ${err.message}`
    });
  }

  // Error genérico
  const cuerpo = {
    success: false,
    message: err.message || MENSAJES.ERROR_SERVIDOR
  };
  // Datos estructurados opcionales (ver AppError). Solo se incluyen si el error
  // los trae, así que ningún error existente cambia de forma.
  if (err.detalles !== undefined) cuerpo.detalles = err.detalles;
  res.status(err.statusCode || 500).json(cuerpo);
};

module.exports = errorHandler;