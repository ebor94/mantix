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

// InnoDB puede abortar una transacción sana por deadlock o espera de bloqueo cuando hay inserciones simultáneas
// sobre el mismo índice UNIQUE. Esas sí se reintentan completas; los errores de negocio y los demás de BD, nunca.
const REINTENTABLES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

async function conReintentos(fn, { intentos = 3, esperaMs = 25 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!err || !REINTENTABLES.has(err.code) || i >= intentos) throw err;
      if (esperaMs) await new Promise((r) => setTimeout(r, esperaMs * i + Math.floor(Math.random() * esperaMs)));
    }
  }
}

module.exports = { enTransaccion, conReintentos };
