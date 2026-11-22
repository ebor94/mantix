const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  413: 'DEMASIADOS_REGISTROS',
  429: 'DEMASIADOS_INTENTOS',
  503: 'NO_DISPONIBLE',
};

/**
 * Primer middleware de toda ruta del módulo: fija el código de API, la cabecera X-HOR-API y el logger
 * hijo, y garantiza que cualquier respuesta de error lleve { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  return (req, res, next) => {
    const inicio = Date.now();
    req.hornoApiCodigo = codigo;
    req.hornoLog = logger.child({ modulo: 'horno', api_codigo: codigo });
    res.setHeader('X-HOR-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.hornoLog.info('horno request', {
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario: req.hornoUsuario ? req.hornoUsuario.usuario : null,
      });
    });
    next();
  };
}

module.exports = apiCodigo;
