// Validación de entrada (spec §17.3) con joi, ya instalado en Mantix.
// - body: estricto (convert: false): un número en texto o un booleano "true" se rechazan.
// - query y params: llegan siempre como texto, así que sí se convierten (con tipos y patrones cerrados).
// - Cualquier campo no declarado → 400 (evita mass assignment). Los errores dicen campo y regla, nunca el valor.
const Joi = require('joi');
const { E } = require('../utils/MasajesError');

// ISO 8601 con zona explícita (Z o ±hh:mm) y sin milisegundos: "2026-11-24T09:00:00-05:00".
const ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const inicio = Joi.string().pattern(ISO_CON_ZONA).custom((v, h) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? h.error('any.invalid') : d;
});
const id = Joi.number().integer().min(1).max(2147483647); // en el cuerpo (JSON): número real
// En la URL o el query: solo dígitos. Con convert, joi aceptaría "1e3" o " 7" como números.
const idParam = Joi.string().pattern(/^[1-9]\d{0,9}$/).custom((v, h) => {
  const n = Number(v);
  return n <= 2147483647 ? n : h.error('number.max');
});
const fecha = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const texto = (max) => Joi.string().max(max).allow('');
const paginacion = { pagina: Joi.number().integer().min(1).max(100000), porPagina: Joi.number().integer().min(1).max(100) };

const OPCIONES = {
  body: { abortEarly: false, allowUnknown: false, convert: false },
  query: { abortEarly: false, allowUnknown: false, convert: true },
  params: { abortEarly: false, allowUnknown: false, convert: true },
};

/**
 * `validar({ body, query, params })` con objetos de esquema joi. El resultado queda en req.v.{body,query,params}
 * (req.query/req.params originales no se tocan). Un cuerpo que no es objeto (arreglo, texto) → 400.
 * `body: false` solo para la importación, cuyo cuerpo es binario y lo valida leerListado.
 */
function validar(esquemas) {
  const omitirBody = esquemas.body === false;
  const compilados = Object.fromEntries(Object.entries(esquemas).filter(([, s]) => s !== false).map(([k, s]) => [k, Joi.object(s)]));
  return (req, res, next) => {
    req.v = req.v || {};
    const detalles = [];
    for (const parte of omitirBody ? ['params', 'query'] : ['params', 'query', 'body']) {
      const esquema = compilados[parte] || Joi.object({});
      let valor = req[parte];
      if (parte === 'body' && (valor === undefined || (typeof valor === 'object' && !Array.isArray(valor) && Object.keys(valor).length === 0))) valor = {};
      if (parte === 'body' && (typeof valor !== 'object' || valor === null || Array.isArray(valor) || Buffer.isBuffer(valor))) {
        detalles.push({ campo: 'body', motivo: 'object.base' });
        continue;
      }
      const { error, value } = esquema.validate(valor || {}, OPCIONES[parte]);
      if (error) for (const d of error.details) detalles.push({ campo: [parte, ...d.path].join('.'), motivo: d.type });
      else req.v[parte] = value;
    }
    return detalles.length ? next(E.VALIDACION(detalles)) : next();
  };
}

module.exports = { validar, Joi, inicio, id, idParam, fecha, texto, paginacion, ISO_CON_ZONA };
