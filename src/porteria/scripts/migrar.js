// npm run porteria:migrate — aplica las migraciones pendientes del módulo Portería.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { leerConexion } = require('../config/entorno');
const { aplicarMigraciones } = require('./migrador');

async function main() {
  const conexion = leerConexion();
  if (!conexion.ok) {
    console.error(`porteria:migrate — ${conexion.motivo}`);
    process.exitCode = 1;
    return;
  }
  const conn = await mysql.createConnection({ ...conexion.db, charset: 'utf8mb4', timezone: '-05:00', multipleStatements: true });
  try {
    await conn.query("SET time_zone = '-05:00'");
    const aplicadas = await aplicarMigraciones(conn, undefined, (a) => console.log(`aplicada ${a}`));
    console.log(aplicadas.length ? `${aplicadas.length} migración(es) aplicada(s)` : 'Sin migraciones pendientes');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('porteria:migrate falló:', err.message);
  process.exitCode = 1;
});
