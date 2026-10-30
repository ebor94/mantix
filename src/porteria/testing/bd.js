// Conexión a la base de pruebas (la crea globalSetup). Solo se permite una base *_test.
require('./env');
const mysql = require('mysql2/promise');

async function abrirConexion() {
  const bd = process.env.DB_NAME;
  if (!/_test$/.test(bd)) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (recibido: ${bd})`);
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: bd,
    charset: 'utf8mb4',
    timezone: '-05:00',
    multipleStatements: true,
  });
}

module.exports = { abrirConexion };
