// src/porteria/__tests__/verificarProduccion.int.test.js
// El script de verificación de producción corre en MySQL 8 y solo lee.
const fs = require('fs');
const path = require('path');
const { abrirConexion } = require('../testing/bd');

const SQL = fs.readFileSync(path.join(__dirname, '../scripts/verificarProduccion.sql'), 'utf8');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });

test('solo tiene sentencias de lectura', () => {
  const sentencias = SQL.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  expect(sentencias.length).toBeGreaterThanOrEqual(6);
  for (const s of sentencias) expect(s).toMatch(/^(SELECT|SHOW)\b/i);
});

test('corre completo y la versión del servidor de pruebas cumple', async () => {
  const [resultados] = await conn.query(SQL);
  const filas = resultados.filter(Array.isArray).flat();
  const chequeo = (nombre) => filas.find((f) => f.chequeo === nombre);
  expect(chequeo('version')).toMatchObject({ ok: 'SI' });
  expect(chequeo('exequias.fecha')).toMatchObject({ valor: 'date', ok: 'SI' });
  expect(chequeo('placas_con_espacios_raros')).toMatchObject({ ok: 'SI' });
  for (const nombre of ['time_zone_global', 'innodb_lock_wait_timeout', 'collation_base', 'collation_vehiculos.placa']) {
    expect(chequeo(nombre)).toBeDefined();
  }
});
