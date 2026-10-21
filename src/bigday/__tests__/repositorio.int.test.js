const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { crearPool } = require('../db');
const { crearRepositorioMysql } = require('../repositorio');

// Solo corre si hay una BD de prueba (ver jest.bigday-int.config.js).
const hayBd = Boolean(process.env.BIGDAY_TEST_DB_HOST);
const describeSiBd = hayBd ? describe : describe.skip;

const cfg = () => ({
  host: process.env.BIGDAY_TEST_DB_HOST,
  port: Number(process.env.BIGDAY_TEST_DB_PORT) || 3306,
  user: process.env.BIGDAY_TEST_DB_USER || 'root',
  password: process.env.BIGDAY_TEST_DB_PASSWORD || '',
  database: process.env.BIGDAY_TEST_DB_NAME || 'serfuweb',
});

const fila = (uuid) => ({
  uuid, p1: 'A', p2: 'ambas', p3: 'memoria', p3_otro: null, p4: 'diversidad', p4_otro: null,
  p5: 'B', p6: 8, p7: 'Texto de prueba de integración.', origen: null, duracion_seg: 30,
  ip_hash: 'a'.repeat(64), ua_hash: 'b'.repeat(64),
});

describeSiBd('repositorio MySQL (integración)', () => {
  let pool;

  beforeAll(async () => {
    const conexion = await mysql.createConnection({ ...cfg(), multipleStatements: true, charset: 'utf8mb4' });
    await conexion.query('DROP TABLE IF EXISTS bigday_respuestas');
    await conexion.query(fs.readFileSync(path.join(__dirname, '../migrations/001_init.sql'), 'utf8'));
    await conexion.end();
    pool = crearPool(cfg());
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('ping() funciona', async () => {
    await expect(crearRepositorioMysql(pool).ping()).resolves.toBeUndefined();
  });

  it('guardar() devuelve creada y luego duplicada para el mismo uuid, sin duplicar filas', async () => {
    const repo = crearRepositorioMysql(pool);
    const uuid = '11111111-2222-4333-8444-555555555555';
    expect(await repo.guardar(fila(uuid))).toBe('creada');
    expect(await repo.guardar(fila(uuid))).toBe('duplicada');
    const [filas] = await pool.query('SELECT COUNT(*) AS n FROM bigday_respuestas WHERE uuid = ?', [uuid]);
    expect(Number(filas[0].n)).toBe(1);
  });
});
