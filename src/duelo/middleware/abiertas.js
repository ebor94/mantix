const DueloError = require('../utils/DueloError');
const { MENSAJE_CERRADAS } = require('../services/inscribir.service');

/** Corta con 403 CERRADAS antes de que Multer reciba hasta 30 MB de fotos (el servicio lo vuelve a verificar). */
const crearAbiertas = (obtenerConfig) => (req, res, next) => (
  obtenerConfig().abiertas ? next() : next(new DueloError(403, 'CERRADAS', MENSAJE_CERRADAS))
);

module.exports = { crearAbiertas };
