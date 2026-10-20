const TrkError = require('../utils/TrkError');

// Valida req[fuente] con un esquema Joi; reemplaza el valor por el convertido/limpio.
function validar(schema, fuente = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[fuente], { abortEarly: false, stripUnknown: true, convert: true });
    if (error) {
      const errors = error.details.map((d) => ({ campo: d.path.join('.'), mensaje: d.message }));
      return next(new TrkError(400, 'VALIDACION', 'Datos inválidos', errors));
    }
    req[fuente] = value;
    return next();
  };
}

module.exports = validar;
