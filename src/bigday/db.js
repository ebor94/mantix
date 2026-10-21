// Pool mysql2 propio del módulo (no usa el Sequelize de Mantix): base `serfuweb` con usuario BIGDAY_DB_*.
const mysql = require('mysql2/promise');

function crearPool(cfg) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    connectionLimit: 10,
    // Sin quitar CLIENT_FOUND_ROWS, un duplicado con ON DUPLICATE KEY reporta affectedRows=1:
    // con '-FOUND_ROWS' vale 0 y así se distingue 'creada' (1) de 'duplicada' (0).
    flags: ['-FOUND_ROWS'],
  });
}

module.exports = { crearPool };
