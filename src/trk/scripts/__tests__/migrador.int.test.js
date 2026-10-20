const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const { aplicarMigraciones } = require('../migrador');

let conn;
let dir;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trk-mig-'));
  fs.writeFileSync(path.join(dir, '002_segunda.sql'), "INSERT INTO trk_prueba_migrador (valor) VALUES ('b');");
  fs.writeFileSync(path.join(dir, '001_primera.sql'), 'CREATE TABLE trk_prueba_migrador (valor VARCHAR(5));\nINSERT INTO trk_prueba_migrador (valor) VALUES (\'a\');');
  fs.writeFileSync(path.join(dir, 'leeme.txt'), 'no es migración');
});

afterAll(async () => {
  await conn.query('DROP TABLE IF EXISTS trk_prueba_migrador');
  await conn.query("DELETE FROM trk_migraciones WHERE nombre IN ('001_primera.sql', '002_segunda.sql')");
  await conn.end();
});

test('aplica en orden numérico y registra en trk_migraciones', async () => {
  const aplicadas = await aplicarMigraciones(conn, dir);
  expect(aplicadas).toEqual(['001_primera.sql', '002_segunda.sql']);
  const [filas] = await conn.query('SELECT valor FROM trk_prueba_migrador ORDER BY valor');
  expect(filas.map((f) => f.valor)).toEqual(['a', 'b']);
});

test('es idempotente: la segunda corrida no aplica nada', async () => {
  const aplicadas = await aplicarMigraciones(conn, dir);
  expect(aplicadas).toEqual([]);
  const [filas] = await conn.query('SELECT COUNT(*) AS n FROM trk_prueba_migrador');
  expect(Number(filas[0].n)).toBe(2);
});
