// src/masajes/repositorios/bloqueos.js
// Un bloqueo [inicio, fin) se solapa con [a, b) si inicio < b y fin > a.

async function enRango(ejecutor, desde, hasta) {
  const [filas] = await ejecutor.execute(
    'SELECT semana_id, inicio, fin FROM msj_bloqueos WHERE inicio < ? AND fin > ?',
    [hasta, desde],
  );
  return filas;
}

async function haySolapado(conn, semanaId, inicio, fin) {
  const [filas] = await conn.execute(
    'SELECT 1 AS si FROM msj_bloqueos WHERE semana_id = ? AND inicio < ? AND fin > ? LIMIT 1',
    [semanaId, fin, inicio],
  );
  return filas.length > 0;
}

module.exports = { enRango, haySolapado };
