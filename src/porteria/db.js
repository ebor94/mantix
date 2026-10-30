// Pool mysql2 propio del módulo (no usa el Sequelize de Mantix). Misma base que H360/Mantix.
const mysql = require('mysql2/promise');

function crearPool(cfg) {
  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    // `timezone` solo afecta cómo mysql2 convierte los Date de JS; NO cambia la zona de la sesión MySQL.
    // La zona de la sesión (NOW(), CURRENT_TIMESTAMP) se fija abajo con SET time_zone en cada conexión nueva.
    timezone: '-05:00',
    connectionLimit: 10,
  });
  // `pool.pool` es el pool interno (API de callbacks); su evento 'connection' entrega cada conexión física nueva.
  // La consulta se encola en esa conexión antes de cualquier otra, así que corre antes del primer uso.
  pool.pool.on('connection', (conexion) => conexion.query("SET time_zone = '-05:00'"));
  return pool;
}

/** El pool se crea en el primer uso: Mantix arranca aunque la configuración de Portería esté incompleta. */
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
