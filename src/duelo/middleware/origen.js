const DueloError = require('../utils/DueloError');

/** Solo acepta peticiones de navegador desde los orígenes del formulario (DUELO_ORIGENES). */
const crearOrigen = (obtenerConfig) => (req, res, next) => {
  const origen = req.get('Origin');
  if (!origen || !obtenerConfig().origenes.includes(origen)) {
    return next(new DueloError(403, 'ORIGEN', 'Origen no permitido'));
  }
  return next();
};

module.exports = { crearOrigen };
