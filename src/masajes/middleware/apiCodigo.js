// Copia adaptada de src/porteria/middleware/apiCodigo.js — si se corrige allá, corregir aquí.
const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  413: 'VALIDACION',
  422: 'VALIDACION',
  429: 'DEMASIADAS_SOLICITUDES',
  503: 'NO_DISPONIBLE',
};

/**
 * Primer middleware de toda ruta de Masajes: fija el código de API, la cabecera X-MSJ-API y el
 * logger hijo, y garantiza que cualquier respuesta de error lleve { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  const middleware = (req, res, next) => {
    const inicio = Date.now();
    req.msjApiCodigo = codigo;
    req.msjLog = logger.child({ modulo: 'masajes', api_codigo: codigo });
    res.setHeader('X-MSJ-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.msjLog.info('masajes request', {
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0], // sin query: puede llevar fechas o ids de beneficiarios
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario: req.msjUsuario ? req.msjUsuario.usuario : null,
      });
    });
    next();
  };
  middleware.msjApiCodigo = codigo;
  return middleware;
}

apiCodigo.MOTIVO_POR_STATUS = MOTIVO_POR_STATUS;
module.exports = apiCodigo;
