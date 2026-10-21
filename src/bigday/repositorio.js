// Repositorio de respuestas sobre MySQL. Interfaz: guardar(fila) -> 'creada' | 'duplicada'; listar() -> filas del evento; ping().
const { crearPool } = require('./db');

const SQL_INSERTAR = `INSERT INTO bigday_respuestas
  (uuid, p1, p2, p3, p3_otro, p4, p4_otro, p5, p6, p7, origen, duracion_seg, ip_hash, ua_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE id = id`;

// Columnas explícitas: ip_hash y ua_hash NUNCA se leen de vuelta. Consulta parametrizada por evento.
const EVENTO_ID = 'october-bigday-2';
const SQL_LISTAR = `SELECT p1, p2, p3, p3_otro, p4, p4_otro, p5, p6, p7, origen, duracion_seg, created_at
  FROM bigday_respuestas
  WHERE evento_id = ?
  ORDER BY created_at ASC, id ASC`;

function crearRepositorioMysql(pool) {
  return {
    async guardar(f) {
      const [res] = await pool.execute(SQL_INSERTAR, [
        f.uuid, f.p1, f.p2, f.p3, f.p3_otro, f.p4, f.p4_otro, f.p5, f.p6, f.p7,
        f.origen, f.duracion_seg, f.ip_hash, f.ua_hash,
      ]);
      return res.affectedRows === 1 ? 'creada' : 'duplicada';
    },
    async listar() {
      const [filas] = await pool.execute(SQL_LISTAR, [EVENTO_ID]);
      return filas;
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

/** Crea el pool al primer uso (no al requerir el módulo), para que Mantix arranque sin BD de bigday. */
function crearRepositorioPerezoso(cfgBd) {
  let repo = null;
  const obtener = () => repo || (repo = crearRepositorioMysql(crearPool(cfgBd)));
  return {
    guardar: (fila) => obtener().guardar(fila),
    listar: () => obtener().listar(),
    ping: () => obtener().ping(),
  };
}

module.exports = { crearRepositorioMysql, crearRepositorioPerezoso, SQL_INSERTAR, SQL_LISTAR, EVENTO_ID };
