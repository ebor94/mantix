const express = require('express');
const { masajesErrorHandler } = require('./errorHandler');

/**
 * Parsers propios de /api/masajes con límite de 10 KB. Se montan en app.js ANTES de los globales de 10 MB:
 * body-parser no vuelve a leer un cuerpo ya leído, así que el límite global no aplica después.
 * El error handler convierte los errores del parser (JSON inválido, 413) al contrato del módulo.
 * La importación de xlsx (multipart) no pasa por aquí: la limita multer (Tarea 11).
 */
function montarParsersMasajes(app) {
  app.use('/api/masajes', express.json({ limit: '10kb' }));
  app.use('/api/masajes', express.urlencoded({ limit: '10kb', extended: false }));
  app.use('/api/masajes', masajesErrorHandler);
}

module.exports = { montarParsersMasajes };
