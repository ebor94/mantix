/**
 * src/trk/scripts/migrador.js
 * Aplica en orden las migraciones NNN_*.sql de src/trk/migrations que no estén
 * registradas en trk_migraciones. La conexión debe tener multipleStatements.
 */
const fs = require('fs');
const path = require('path');

const DIR_MIGRACIONES = path.join(__dirname, '..', 'migrations');
const PATRON = /^\d{3}_[a-z0-9_]+\.sql$/;

async function aplicarMigraciones(conn, dir = DIR_MIGRACIONES, log = () => {}) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS trk_migraciones (
       nombre VARCHAR(150) NOT NULL PRIMARY KEY,
       aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  const [filas] = await conn.query('SELECT nombre FROM trk_migraciones');
  const hechas = new Set(filas.map((f) => f.nombre));
  const archivos = fs.readdirSync(dir).filter((f) => PATRON.test(f)).sort();

  const aplicadas = [];
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8');
    await conn.query(sql);
    await conn.query('INSERT INTO trk_migraciones (nombre) VALUES (?)', [archivo]);
    aplicadas.push(archivo);
    log(archivo);
  }
  return aplicadas;
}

module.exports = { aplicarMigraciones, DIR_MIGRACIONES };
