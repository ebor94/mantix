const fs = require('fs');
const os = require('os');
const path = require('path');
const { aplicarMigraciones, DIR_MIGRACIONES, TABLA } = require('../scripts/migrador');

function dirCon(archivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msj-mig-'));
  for (const [nombre, sql] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, nombre), sql);
  return dir;
}

function connFalsa(yaAplicadas) {
  const llamadas = [];
  return {
    llamadas,
    query: jest.fn(async (sql, params) => {
      llamadas.push([sql, params]);
      if (/^SELECT nombre FROM msj_migraciones/.test(sql)) return [yaAplicadas.map((nombre) => ({ nombre }))];
      return [[]];
    }),
  };
}

test('registra en su propia tabla, no en la de Portería', () => {
  expect(TABLA).toBe('msj_migraciones');
});

test('aplica en orden solo las migraciones pendientes y las registra', async () => {
  const dir = dirCon({
    '002_b.sql': 'SQL B', '001_a.sql': 'SQL A', '003_c.sql': 'SQL C', 'notas.txt': 'x', '4_mal.sql': 'x', '005_Mayus.sql': 'x',
  });
  const conn = connFalsa(['001_a.sql']);
  const aplicadas = await aplicarMigraciones(conn, dir);

  expect(aplicadas).toEqual(['002_b.sql', '003_c.sql']);
  const sqls = conn.llamadas.map(([sql]) => sql);
  expect(sqls[0]).toMatch(/CREATE TABLE IF NOT EXISTS msj_migraciones/);
  expect(sqls).toContain('SQL B');
  expect(sqls).not.toContain('SQL A');
  expect(sqls.indexOf('SQL B')).toBeLessThan(sqls.indexOf('SQL C'));
  expect(conn.llamadas).toContainEqual(['INSERT INTO msj_migraciones (nombre) VALUES (?)', ['003_c.sql']]);
});

test('si una migración falla no la registra y no sigue con las siguientes', async () => {
  const dir = dirCon({ '001_a.sql': 'SQL A', '002_b.sql': 'FALLA', '003_c.sql': 'SQL C' });
  const conn = connFalsa([]);
  conn.query.mockImplementation(async (sql, params) => {
    conn.llamadas.push([sql, params]);
    if (sql === 'FALLA') throw new Error('sintaxis');
    if (/^SELECT nombre/.test(sql)) return [[]];
    return [[]];
  });
  await expect(aplicarMigraciones(conn, dir)).rejects.toThrow('sintaxis');
  const sqls = conn.llamadas.map(([sql]) => sql);
  expect(sqls).not.toContain('SQL C');
  expect(conn.llamadas).not.toContainEqual(['INSERT INTO msj_migraciones (nombre) VALUES (?)', ['002_b.sql']]);
});

test('el directorio real solo tiene migraciones con nombre válido', () => {
  const archivos = fs.readdirSync(DIR_MIGRACIONES);
  expect(archivos.length).toBeGreaterThan(0);
  for (const a of archivos) expect(a).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
});
