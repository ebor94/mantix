/**
 * Aplica en orden las migraciones NNN_*.sql de src/masajes/migrations que no estén registradas
 * en msj_migraciones. La conexión debe tener multipleStatements.
 * Copia de src/porteria/scripts/migrador.js con tabla y carpeta propias — si se corrige allá, corregir aquí.
 */
const fs = require('fs');
const path = require('path');

const DIR_MIGRACIONES = path.join(__dirname, '..', 'migrations');
const TABLA = 'msj_migraciones';
const PATRON = /^\d{3}_[a-z0-9_]+\.sql$/;

async function aplicarMigraciones(conn, dir = DIR_MIGRACIONES, log = () => {}) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS ${TABLA} (
       nombre VARCHAR(150) NOT NULL PRIMARY KEY,
       aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  const [filas] = await conn.query(`SELECT nombre FROM ${TABLA}`);
  const hechas = new Set(filas.map((f) => f.nombre));
  const archivos = fs.readdirSync(dir).filter((f) => PATRON.test(f)).sort();

  const aplicadas = [];
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    // DDL en MySQL hace commit implícito: si una migración falla a medias, no se registra y hay que
    // revisarla a mano. Por eso cada archivo usa CREATE TABLE IF NOT EXISTS y debe ser re-ejecutable.
    await conn.query(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    await conn.query(`INSERT INTO ${TABLA} (nombre) VALUES (?)`, [archivo]);
    aplicadas.push(archivo);
    log(archivo);
  }
  return aplicadas;
}

module.exports = { aplicarMigraciones, DIR_MIGRACIONES, TABLA };
