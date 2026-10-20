// Proyección de un error apta para logs: los errores de MySQL/Sequelize incluyen
// valores del usuario (p. ej. "Duplicate entry '<documento>'") en message, sql,
// sqlMessage, parameters, fields y en la primera línea del stack. Nada de eso se registra.
function errorParaLog(err) {
  if (!err || typeof err !== 'object') return {};
  const salida = {};
  if (err.name) salida.name = err.name;
  const codigo = (err.parent && err.parent.code) || (err.original && err.original.code);
  if (codigo) salida.codigo = codigo;
  if (typeof err.stack === 'string') {
    const resto = err.stack.split('\n').slice(1).join('\n');
    if (resto) salida.stack = resto;
  }
  return salida;
}

module.exports = { errorParaLog };
