// Envuelve handlers async para que los rechazos lleguen a trkErrorHandler.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
