// Pool mysql2 propio del módulo (no usa el Sequelize de Mantix). Misma base que Mantix.
const mysql = require('mysql2/promise');

function crearPool(cfg) {
  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    timezone: '-05:00',
    connectionLimit: 5,
  });
  // La zona de la sesión MySQL (NOW(), CURRENT_TIMESTAMP) se fija en cada conexión física nueva.
  pool.pool.on('connection', (conexion) => conexion.query("SET time_zone = '-05:00'"));
  return pool;
}

/** El pool se crea en el primer uso: Mantix arranca aunque la configuración de Duelo esté incompleta. */
function crearBdPerezosa(cfgFn) {
  let pool = null;
  const obtener = () => {
    if (!pool) pool = crearPool(cfgFn());
    return pool;
  };
  return {
    obtener,
    async ping() { await obtener().query('SELECT 1'); },
    async cerrar() {
      if (!pool) return;
      const actual = pool;
      pool = null;
      await actual.end();
    },
  };
}

module.exports = { crearPool, crearBdPerezosa };
