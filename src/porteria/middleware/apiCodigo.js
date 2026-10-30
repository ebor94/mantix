const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'VALIDACION',
  429: 'DEMASIADOS_INTENTOS',
  503: 'NO_DISPONIBLE',
};

/**
 * Primer middleware de toda ruta de Portería: fija el código de API, la cabecera X-POR-API y el
 * logger hijo, y garantiza que cualquier respuesta de error lleve { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  const middleware = (req, res, next) => {
    const inicio = Date.now();
    req.porApiCodigo = codigo;
    req.porLog = logger.child({ modulo: 'porteria', api_codigo: codigo });
    res.setHeader('X-POR-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.porLog.info('porteria request', {
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0], // sin query: puede llevar placas o documentos
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario: req.porUsuario ? req.porUsuario.usuario : null,
      });
    });
    next();
  };
  middleware.porApiCodigo = codigo;
  return middleware;
}

apiCodigo.MOTIVO_POR_STATUS = MOTIVO_POR_STATUS;
module.exports = apiCodigo;
