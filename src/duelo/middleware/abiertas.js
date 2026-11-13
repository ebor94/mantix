const DueloError = require('../utils/DueloError');

/** Corta con 403 CERRADAS (cierre manual o cupo lleno) antes de que Multer reciba hasta 30 MB de fotos. */
const crearAbiertas = (disponibilidad) => async (req, res, next) => {
  try {
    const { abiertas, mensaje } = await disponibilidad.estado();
    return abiertas ? next() : next(new DueloError(403, 'CERRADAS', mensaje));
  } catch (err) {
    return next(err);
  }
};

module.exports = { crearAbiertas };
