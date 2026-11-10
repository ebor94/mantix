// Recrea la base de pruebas con las migraciones de Masajes. Una vez por corrida.
require('./env');
const mysql = require('mysql2/promise');
const { validarBdPrueba } = require('./bd');
const { aplicarMigraciones } = require('../scripts/migrador');

module.exports = async () => {
  validarBdPrueba(process.env);
  const bd = process.env.DB_NAME;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${bd}\``);
  await conn.query(`CREATE DATABASE \`${bd}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${bd}\``);
  await conn.query("SET time_zone = '-05:00'");
  await aplicarMigraciones(conn);
  await conn.end();
};
