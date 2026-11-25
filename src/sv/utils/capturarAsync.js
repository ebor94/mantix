/**
 * sv/utils/capturarAsync.js
 * Express 4 no recoge la promesa rechazada de un handler async, y server.js termina el
 * proceso ante cualquier unhandledRejection. capturarAsync recorre un router ya montado
 * (y sus subrouters) y hace que esos rechazos lleguen a next(err).
 *
 * Usa la estructura interna de Express 4 (router.stack / layer.handle). Express 5 reenvía
 * los rechazos por sí mismo: al migrar, este archivo se elimina.
 */
const logger = require('../../utils/logger');

const CAPTURADO = Symbol.for('sv.capturado');
const TERMINADA = Symbol('sv.respuestaTerminada');

// compression() termina la respuesta real después de que el handler llamó a res.end, así
// que res.writableEnded no alcanza para saber si el handler ya respondió.
function vigilarRespuesta(res) {
  if (res[TERMINADA] !== undefined) return;
  res[TERMINADA] = false;
  const end = res.end;
  res.end = function (...args) {
    res[TERMINADA] = true;
    return end.apply(this, args);
  };
}

function envolver(layer) {
  const original = layer.handle;
  // Cuatro argumentos = manejador de errores (err, req, res, next): no se toca.
  if (original.length > 3 || original[CAPTURADO]) return;

  const capturado = function (req, res, next) {
    vigilarRespuesta(res);
    const resultado = original.call(this, req, res, next);
    if (resultado && typeof resultado.catch === 'function') {
      resultado.catch((motivo) => {
        // next(undefined) seguiría como si no hubiera error.
        const err = motivo || new Error('Promesa rechazada sin motivo');
        // Con la respuesta ya terminada, next(err) cortaría la conexión: solo se anota.
        if (res[TERMINADA]) {
          logger.error('[SV] Error después de responder', {
            detalle: err.message || String(err), stack: err.stack, method: req.method, path: req.baseUrl + req.path
          });
          return;
        }
        next(err);
      });
    }
    return resultado;
  };
  capturado[CAPTURADO] = true;
  layer.handle = capturado;
}

function capturarAsync(router) {
  for (const layer of router.stack) {
    if (layer.route) layer.route.stack.forEach(envolver);
    else if (Array.isArray(layer.handle.stack)) capturarAsync(layer.handle);
    else envolver(layer);
  }
  return router;
}

module.exports = { capturarAsync };
