// Transacción sobre una conexión del pool del módulo. Un deadlock se reintenta: con dos registros
// simultáneos de la misma placa InnoDB puede abortar uno, y al reintentar ya encuentra la fila bloqueada.
// `fn` se vuelve a ejecutar en el reintento: no debe tener efectos fuera de la transacción.
// Si el bloqueo persiste (deadlock tras el reintento o timeout) se responde 409, no 500.
const PorteriaError = require('./PorteriaError');

const ER_LOCK_DEADLOCK = 1213;
const ER_LOCK_WAIT_TIMEOUT = 1205;

const MENSAJE_OCUPADO = 'Otro registro de esta placa está en curso. Intenta de nuevo.';
const ocupado = (mensaje) => new PorteriaError(409, 'OCUPADO', mensaje);

async function conTransaccion(bd, fn, { reintentos = 1, mensajeOcupado = MENSAJE_OCUPADO } = {}) {
  for (let intento = 0; ; intento += 1) {
    const conn = await bd.obtener().getConnection();
    let descartar = false;
    try {
      await conn.beginTransaction();
      const resultado = await fn(conn);
      await conn.commit();
      return resultado;
    } catch (err) {
      await conn.rollback().catch(() => { descartar = true; });
      const errno = err && err.errno;
      if (errno === ER_LOCK_DEADLOCK && intento < reintentos) continue;
      if (errno === ER_LOCK_DEADLOCK || errno === ER_LOCK_WAIT_TIMEOUT) throw ocupado(mensajeOcupado);
      throw err;
    } finally {
      // Una conexión que no pudo revertir queda en estado dudoso: no vuelve al pool.
      if (descartar) conn.destroy(); else conn.release();
    }
  }
}

module.exports = { conTransaccion };
