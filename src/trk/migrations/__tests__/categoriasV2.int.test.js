// 008 Categorías v2: PEQ_MED se renombra a PEQUENOS (conserva id, participantes y calificaciones),
// nace MEDIANOS y se reordenan las 5 categorías.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../../../models');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante, calificar } = require('../../testing/fabricas');

const DIR = path.join(__dirname, '..');
const q = async (sql, replacements = []) => (await db.sequelize.query(sql, { replacements }))[0];

async function ejecutarArchivo(archivo) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true, charset: 'utf8mb4'
  });
  try { await conn.query(fs.readFileSync(path.join(DIR, archivo), 'utf8')); } finally { await conn.end(); }
}

const ESPERADO = [
  ['PEQUENOS', 'Caninos pequeños', 'INDIVIDUAL', 1, 1, 0, 3],
  ['MEDIANOS', 'Caninos medianos', 'INDIVIDUAL', 2, 1, 0, 3],
  ['GRANDES', 'Caninos grandes', 'INDIVIDUAL', 3, 1, 0, 3],
  ['FELINOS', 'Felinos', 'INDIVIDUAL', 4, 1, 0, 3],
  ['FAMILIAR', 'Disfraz familiar (mascota + acompañante/s)', 'FAMILIAR', 5, 1, 0, 3]
];

async function categorias() {
  const filas = await q('SELECT c.codigo, c.nombre, r.codigo AS rubrica, c.orden, c.abierta, c.ranking_publicado, c.puestos_premiados FROM trk_categorias c JOIN trk_rubricas r ON r.id = c.rubrica_id ORDER BY c.orden');
  return filas.map((f) => [f.codigo, f.nombre, f.rubrica, f.orden, Number(f.abierta), Number(f.ranking_publicado), f.puestos_premiados]);
}

beforeEach(limpiar);
afterAll(cerrar);

test('quedan exactamente las 5 categorías v2, en orden y con su rúbrica', async () => {
  expect(await categorias()).toEqual(ESPERADO);
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM trk_categorias WHERE codigo = 'PEQ_MED'");
  expect(Number(n)).toBe(0);
});

test('sobre la BD de antes (PEQ_MED con datos), renombra en sitio: mismo id, participante y calificaciones intactos', async () => {
  // Reconstruye el estado previo a 008: PEQ_MED (orden 1), GRANDES 2, FELINOS 3, FAMILIAR 4 y sin MEDIANOS.
  await q("DELETE FROM trk_categorias WHERE codigo = 'MEDIANOS'");
  await q("UPDATE trk_categorias SET codigo = 'PEQ_MED', nombre = 'Caninos pequeños y medianos', orden = 1 WHERE codigo = 'PEQUENOS'");
  await q("UPDATE trk_categorias SET orden = CASE codigo WHEN 'GRANDES' THEN 2 WHEN 'FELINOS' THEN 3 WHEN 'FAMILIAR' THEN 4 END WHERE codigo IN ('GRANDES', 'FELINOS', 'FAMILIAR')");
  const [{ id: idAntes }] = await q("SELECT id FROM trk_categorias WHERE codigo = 'PEQ_MED'");
  const jurado = await crearOperativo('TRK_JURADO');
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO', categoriaCodigo: 'PEQ_MED' });
  await calificar(kira, jurado.usuario, { CREATIVIDAD: 40, BIENESTAR: 25, PASARELA: 15 });

  await ejecutarArchivo('008_categorias_v2.sql');

  expect(await categorias()).toEqual(ESPERADO);
  const [{ id: idDespues }] = await q("SELECT id FROM trk_categorias WHERE codigo = 'PEQUENOS'");
  expect(idDespues).toBe(idAntes);
  await kira.reload({ include: ['categoria'] });
  expect(kira.categoria.codigo).toBe('PEQUENOS');
  expect(kira.categoria_id).toBe(idAntes);
  const cals = await db.TrkCalificacion.findAll({ where: { participante_id: kira.id } });
  expect(cals.map((c) => c.total)).toEqual([80]);
});

test('es reaplicable sin error (no duplica ni cambia ids)', async () => {
  const antes = await q('SELECT id, codigo FROM trk_categorias ORDER BY id');
  await ejecutarArchivo('008_categorias_v2.sql');
  await ejecutarArchivo('008_categorias_v2.sql');
  expect(await q('SELECT id, codigo FROM trk_categorias ORDER BY id')).toEqual(antes);
  expect(await categorias()).toEqual(ESPERADO);
});

test('si 003 se reaplicara (PEQ_MED vacía junto a PEQUENOS), 008 la elimina y restaura el orden', async () => {
  await ejecutarArchivo('003_seed_rubricas.sql');
  await ejecutarArchivo('007_rubrica_v2.sql');
  await ejecutarArchivo('008_categorias_v2.sql');
  expect(await categorias()).toEqual(ESPERADO);
});
