/**
 * sv/middleware/validate.js
 * Wrapper Joi: valida req.body, req.query o req.params contra un schema.
 * En error responde 422 con detalle.
 */
const { fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      const errors = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
      return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Datos inválidos', errors);
    }
    req[source] = value;
    next();
  };
}

module.exports = { validate };
