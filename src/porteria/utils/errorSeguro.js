// Proyección de un error apta para logs. Reutiliza la de TRK (Sequelize: err.parent/original.code) y agrega
// los campos de mysql2, que viajan en el propio error. Nunca message, sqlMessage, sql ni parameters:
// pueden contener placas o documentos ("Duplicate entry 'ABC123'").
const { errorParaLog: errorParaLogTrk } = require('../../trk/utils/errorSeguro');

function errorParaLog(err) {
  const salida = errorParaLogTrk(err);
  if (!err || typeof err !== 'object') return salida;
  if (err.code && !salida.codigo) salida.codigo = err.code;
  if (err.errno !== undefined && err.errno !== null) salida.errno = err.errno;
  if (err.sqlState) salida.sqlState = err.sqlState;
  return salida;
}

module.exports = { errorParaLog };
