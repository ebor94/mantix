const { abrirConexion } = require('../testing/bd');
const { aplicarMigraciones } = require('../scripts/migrador');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });

test('las tablas existen con sus columnas', async () => {
  const [ins] = await conn.query('SHOW COLUMNS FROM duelo_inscripciones');
  expect(ins.map((c) => c.Field)).toEqual(expect.arrayContaining([
    'id', 'nombre_completo', 'cedula', 'celular', 'correo', 'honra_companero', 'acepta_politica',
    'version_politica', 'fecha_aceptacion', 'ip', 'user_agent', 'utm_source', 'utm_medium',
    'utm_campaign', 'utm_content', 'fbclid', 'correo_enviado', 'correo_error', 'created_at',
  ]));
  const [com] = await conn.query('SHOW COLUMNS FROM duelo_companeros');
  expect(com.map((c) => c.Field)).toEqual(
    ['id', 'inscripcion_id', 'orden', 'nombre', 'foto_ruta', 'foto_mime', 'foto_bytes'],
  );
});

test('la cédula es única', async () => {
  const sql = `INSERT INTO duelo_inscripciones
    (nombre_completo, cedula, celular, correo, honra_companero, acepta_politica, version_politica, fecha_aceptacion)
    VALUES ('Ana Pérez', '900000001', '3001234567', 'a@b.co', 0, 1, 'borrador', NOW())`;
  await conn.query(sql);
  await expect(conn.query(sql)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  await conn.query("DELETE FROM duelo_inscripciones WHERE cedula = '900000001'");
});

test('aplicar de nuevo no repite migraciones', async () => {
  expect(await aplicarMigraciones(conn)).toEqual([]);
});
