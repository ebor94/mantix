const { crearPool } = require('../db');

let pool;
beforeAll(() => {
  pool = crearPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
});
afterAll(async () => { await pool.end(); });

test('cada conexión del pool trabaja en la zona de Colombia (-05:00)', async () => {
  const [[fila]] = await pool.query('SELECT @@session.time_zone AS tz');
  expect(fila.tz).toBe('-05:00');
});
