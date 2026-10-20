const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'VALIDACION',
  429: 'DEMASIADOS_INTENTOS'
};

/**
 * Primer middleware de toda ruta TRK. Fija el código de API en el request, el
 * encabezado X-TRK-API y el logger hijo; además garantiza que cualquier respuesta
 * de error (incluidas las de middlewares de Mantix como requirePermiso) lleve
 * { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  const middleware = (req, res, next) => {
    const inicio = Date.now();
    req.trkApiCodigo = codigo;
    req.trkLog = logger.child({ modulo: 'trk', api_codigo: codigo });
    res.setHeader('X-TRK-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.trkLog.info('trk request', {
        metodo: req.method,
        ruta: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario_id: req.usuario ? req.usuario.id : null
      });
    });
    next();
  };
  middleware.trkApiCodigo = codigo;
  return middleware;
}

module.exports = apiCodigo;
