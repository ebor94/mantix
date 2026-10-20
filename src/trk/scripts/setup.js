/**
 * src/trk/scripts/setup.js
 * Aplica las migraciones TRK sobre la base configurada en DB_* (serfuweb en producción).
 * Uso: npm run trk:setup
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { aplicarMigraciones } = require('./migrador');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4'
  });
  console.log(`✅ Conectado a ${process.env.DB_HOST}/${process.env.DB_NAME}`);
  try {
    const aplicadas = await aplicarMigraciones(conn, undefined, (f) => console.log(`   ✅ ${f}`));
    console.log(aplicadas.length ? `✔ ${aplicadas.length} migración(es) aplicada(s)` : '✔ Sin migraciones pendientes');
  } catch (e) {
    console.error('❌ Falló una migración:', e.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
