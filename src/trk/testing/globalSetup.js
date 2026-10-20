// Recrea serfuweb_test: base mínima de Mantix + migraciones TRK. Corre una vez por `jest -c jest.trk-int.config.js`.
require('./env');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { aplicarMigraciones } = require('../scripts/migrador');

module.exports = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4'
  });
  const bd = process.env.DB_NAME;
  if (!/_test$/.test(bd)) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (recibido: ${bd})`);
  await conn.query(`DROP DATABASE IF EXISTS \`${bd}\``);
  await conn.query(`CREATE DATABASE \`${bd}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${bd}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'sql', 'mantix_base.sql'), 'utf8'));
  await aplicarMigraciones(conn);
  await conn.end();
};
