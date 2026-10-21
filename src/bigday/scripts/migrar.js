// Aplica las migraciones de October Big Day (001 y 002) a la base `serfuweb`: npm run bigday:migrate
// Usa la misma resolución de conexión que el módulo, sin exigir la sal (BIGDAY_DB_* o, si faltan, las DB_* de Mantix).
// La 003 (usuario de mínimo privilegio) es manual y no se aplica aquí.
const fs = require('node:fs');
const path = require('node:path');

const DIR_MIGRACIONES = path.join(__dirname, '..', 'migrations');
const APLICABLES = /^(001|002)_.+\.sql$/;

/** Migraciones automáticas, en orden: [{ nombre, ruta }]. Excluye la 003 (manual). */
function listarMigraciones(dir = DIR_MIGRACIONES) {
  return fs.readdirSync(dir)
    .filter((nombre) => APLICABLES.test(nombre))
    .sort()
    .map((nombre) => ({ nombre, ruta: path.join(dir, nombre) }));
}

/** Aplica las migraciones con una conexión nueva a `db` ({host,port,user,password,database}). */
async function migrar(db, { log = console.log, dir } = {}) {
  const mysql = require('mysql2/promise');
  const conexion = await mysql.createConnection({
    host: db.host, port: db.port, user: db.user, password: db.password, database: db.database,
    multipleStatements: true, charset: 'utf8mb4',
  });
  try {
    for (const { nombre, ruta } of listarMigraciones(dir)) {
      await conexion.query(fs.readFileSync(ruta, 'utf8'));
      log(`bigday: migración ${nombre} aplicada en ${db.database}`);
    }
  } finally {
    await conexion.end();
  }
}

const CODIGOS_ACCESO = [
  'ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR',
];

/** Líneas de error para mostrar: solo código y mensaje de MySQL (nunca la configuración, que lleva la contraseña). */
function mensajeError(err) {
  const lineas = [`bigday: la migración falló (${err.code || 'error'}): ${err.sqlMessage || err.message}`];
  if (CODIGOS_ACCESO.includes(err.code)) {
    lineas.push('bigday: el usuario necesita CREATE y CREATE VIEW sobre la base indicada.');
  }
  return lineas;
}

async function main() {
  require('dotenv').config();
  const { leerConexion } = require('../config/entorno');
  const entorno = leerConexion();
  if (!entorno.ok) {
    console.error(`bigday: no se puede migrar, faltan variables: ${entorno.faltantes.join(', ')}`);
    process.exit(1);
  }
  const { host, port, database } = entorno.db;
  console.log(`bigday: conectando a ${host}:${port}/${database}`);
  try {
    await migrar(entorno.db);
    console.log('bigday: migraciones completas');
  } catch (err) {
    for (const l of mensajeError(err)) console.error(l);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { listarMigraciones, migrar, mensajeError, DIR_MIGRACIONES };
