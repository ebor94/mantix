const express = require('express');
const { dueloErrorHandler } = require('./errorHandler');

/**
 * Parsers propios de /api/duelo con límite de 10 KB. Se montan en app.js ANTES de los globales de 10 MB:
 * body-parser no vuelve a leer un cuerpo ya leído. El error handler responde los errores del parser
 * (JSON inválido 400, demasiado grande 413) con el contrato del módulo y sin registrar el cuerpo.
 * La inscripción (multipart/form-data) no pasa por aquí: estos parsers la ignoran y la limita Multer.
 */
function montarParsersDuelo(app) {
  app.use('/api/duelo', express.json({ limit: '10kb' }));
  app.use('/api/duelo', express.urlencoded({ limit: '10kb', extended: false }));
  app.use('/api/duelo', dueloErrorHandler);
}

module.exports = { montarParsersDuelo };
