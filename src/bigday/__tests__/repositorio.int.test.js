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

  describe('listar()', () => {
    beforeAll(async () => {
      await pool.query('DELETE FROM bigday_respuestas');
      const repo = crearRepositorioMysql(pool);
      await repo.guardar({ ...fila('00000000-0000-4000-8000-000000000003'), p7: 'tercera' });
      await repo.guardar({ ...fila('00000000-0000-4000-8000-000000000001'), p7: 'primera' });
      await repo.guardar({ ...fila('00000000-0000-4000-8000-000000000002'), p7: 'segunda', p3: 'otro', p3_otro: 'Un santuario' });
      // created_at explícito para fijar el orden; la fila de otro evento debe quedar fuera
      await pool.query("UPDATE bigday_respuestas SET created_at = '2026-10-17 10:00:00' WHERE p7 = 'primera'");
      await pool.query("UPDATE bigday_respuestas SET created_at = '2026-10-17 11:00:00' WHERE p7 = 'segunda'");
      await pool.query("UPDATE bigday_respuestas SET created_at = '2026-10-17 12:00:00' WHERE p7 = 'tercera'");
      await repo.guardar({ ...fila('00000000-0000-4000-8000-000000000009'), p7: 'de otro evento' });
      await pool.query("UPDATE bigday_respuestas SET evento_id = 'otro-evento' WHERE p7 = 'de otro evento'");
    });

    it('devuelve solo las filas del evento october-bigday-2, ordenadas por created_at', async () => {
      const filas = await crearRepositorioMysql(pool).listar();
      expect(filas.map((f) => f.p7)).toEqual(['primera', 'segunda', 'tercera']);
      expect(filas[0].created_at).toBeInstanceOf(Date);
    });

    it('expone las columnas necesarias y nunca ip_hash ni ua_hash', async () => {
      const filas = await crearRepositorioMysql(pool).listar();
      const claves = Object.keys(filas[1]).sort();
      expect(claves).toEqual([
        'created_at', 'duracion_seg', 'origen', 'p1', 'p2', 'p3', 'p3_otro', 'p4', 'p4_otro', 'p5', 'p6', 'p7',
      ]);
      expect(claves).not.toContain('ip_hash');
      expect(claves).not.toContain('ua_hash');
      expect(filas[1]).toMatchObject({ p3: 'otro', p3_otro: 'Un santuario', p6: 8 });
    });
  });
});
