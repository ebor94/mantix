// Transacción sobre una conexión del pool del módulo. Un deadlock se reintenta: con dos registros
// simultáneos de la misma placa InnoDB puede abortar uno, y al reintentar ya encuentra la fila bloqueada.
const ER_LOCK_DEADLOCK = 1213;

async function conTransaccion(bd, fn, { reintentos = 1 } = {}) {
  for (let intento = 0; ; intento += 1) {
    const conn = await bd.obtener().getConnection();
    try {
      await conn.beginTransaction();
      const resultado = await fn(conn);
      await conn.commit();
      return resultado;
    } catch (err) {
      await conn.rollback().catch(() => {});
      const reintentar = err && err.errno === ER_LOCK_DEADLOCK && intento < reintentos;
      if (!reintentar) throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { conTransaccion };
