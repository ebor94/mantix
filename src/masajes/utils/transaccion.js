/**
 * Ejecuta `fn(conn)` en una transacción de una conexión del pool del módulo.
 * Commit si `fn` termina bien; rollback si lanza (y se relanza el error original). Siempre libera la conexión.
 */
async function enTransaccion(bd, fn) {
  const conn = await bd.obtener().getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    try { await conn.rollback(); } catch { /* el error que importa es el original */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { enTransaccion };
