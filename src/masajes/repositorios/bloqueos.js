// src/masajes/repositorios/bloqueos.js
// Un bloqueo [inicio, fin) se solapa con [a, b) si inicio < b y fin > a.

async function enRango(ejecutor, desde, hasta) {
  const [filas] = await ejecutor.execute(
    'SELECT semana_id, inicio, fin FROM msj_bloqueos WHERE inicio < ? AND fin > ?',
    [hasta, desde],
  );
  return filas;
}

// Lectura CON bloqueo (FOR SHARE): siempre ve lo último confirmado, no la foto de la transacción. Así, si un
// bloqueo se creó mientras esta transacción esperaba la semana, se ve.
async function haySolapado(conn, semanaId, inicio, fin) {
  const [filas] = await conn.execute(
    'SELECT 1 AS si FROM msj_bloqueos WHERE semana_id = ? AND inicio < ? AND fin > ? LIMIT 1 FOR SHARE',
    [semanaId, fin, inicio],
  );
  return filas.length > 0;
}

async function insertar(conn, { semanaId, inicio, fin, motivo, detalle, actor }) {
  const [r] = await conn.execute(
    'INSERT INTO msj_bloqueos (semana_id, inicio, fin, motivo, detalle, creado_por) VALUES (?, ?, ?, ?, ?, ?)',
    [semanaId, inicio, fin, motivo, detalle, actor],
  );
  return r.insertId;
}

/** Solo si el bloqueo es de esa semana: un id de otra semana no se borra desde aquí. */
async function eliminar(conn, id, semanaId) {
  const [r] = await conn.execute('DELETE FROM msj_bloqueos WHERE id = ? AND semana_id = ?', [id, semanaId]);
  return r.affectedRows === 1;
}

async function listarDeSemana(ejecutor, semanaId) {
  const [filas] = await ejecutor.execute(
    'SELECT id, inicio, fin, motivo, detalle, creado_por FROM msj_bloqueos WHERE semana_id = ? ORDER BY inicio', [semanaId],
  );
  return filas;
}

module.exports = { enRango, haySolapado, insertar, eliminar, listarDeSemana };
