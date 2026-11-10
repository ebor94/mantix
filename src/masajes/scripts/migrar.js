// npm run masajes:migrate — aplica las migraciones pendientes del módulo Masajes.
// Corre con DB_USER (tiene DDL), nunca con el usuario de mínimo privilegio MSJ_DB_USER.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { leerConexion } = require('../config/entorno');
const { aplicarMigraciones } = require('./migrador');

async function main() {
  const conexion = leerConexion(process.env, { paraMigrar: true });
  if (!conexion.ok) {
    console.error(`masajes:migrate — ${conexion.motivo}`);
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
  // Solo el código: el mensaje de MySQL puede traer datos o credenciales del DSN.
  console.error('masajes:migrate falló:', err.code || err.name);
  process.exitCode = 1;
});
