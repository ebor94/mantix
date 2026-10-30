// Pool mysql2 propio del módulo (no usa el Sequelize de Mantix). Misma base que H360/Mantix.
const mysql = require('mysql2/promise');

function crearPool(cfg) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    // Las fechas se guardan en la zona de la sesión (Colombia); el pool debe leerlas en la misma zona.
    timezone: '-05:00',
    connectionLimit: 10,
  });
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
