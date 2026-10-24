// 009 Categorías v3: columna color, nombres y orden definitivos. Mismos códigos e ids.
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
  ['MEDIANOS', 'Caninos raza mediana', '#92D050', 'INDIVIDUAL', 1],
  ['PEQUENOS', 'Caninos raza pequeña', '#FF9900', 'INDIVIDUAL', 2],
  ['FELINOS', 'Felinos', '#00B0F0', 'INDIVIDUAL', 3],
  ['GRANDES', 'Caninos raza grande', '#FFFF00', 'INDIVIDUAL', 4],
  ['FAMILIAR', 'Disfraz familiar', '#FF0000', 'FAMILIAR', 5]
];

async function categorias() {
  const filas = await q('SELECT c.codigo, c.nombre, c.color, r.codigo AS rubrica, c.orden FROM trk_categorias c JOIN trk_rubricas r ON r.id = c.rubrica_id ORDER BY c.orden');
  return filas.map((f) => [f.codigo, f.nombre, f.color, f.rubrica, f.orden]);
}

beforeEach(limpiar);
afterAll(async () => {
  await ejecutarArchivo('009_categorias_v3.sql');
  await cerrar();
});

test('quedan exactamente las 5 categorías v3, en orden, con color y rúbrica', async () => {
  expect(await categorias()).toEqual(ESPERADO);
  const [col] = await q("SELECT DATA_TYPE AS tipo, CHARACTER_MAXIMUM_LENGTH AS largo, IS_NULLABLE AS nulo FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'trk_categorias' AND column_name = 'color'");
  expect(col).toEqual({ tipo: 'char', largo: 7, nulo: 'YES' });
});

test('el modelo TrkCategoria expone color', async () => {
  const c = await db.TrkCategoria.findOne({ where: { codigo: 'FELINOS' } });
  expect(c.color).toBe('#00B0F0');
});

test('sobre la BD de antes (v2, sin columna color), conserva ids, participantes y calificaciones', async () => {
  // Datos primero (el modelo ya conoce color); luego se reconstruye el esquema/datos v2 previos a 009.
  const jurado = await crearOperativo('TRK_JURADO');
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO', categoriaCodigo: 'MEDIANOS' });
  await calificar(kira, jurado.usuario, { CREATIVIDAD: 40, BIENESTAR: 25, PASARELA: 15 });
  await q('ALTER TABLE trk_categorias DROP COLUMN color');
  await ejecutarArchivo('008_categorias_v2.sql');
  expect((await q("SELECT nombre FROM trk_categorias WHERE codigo = 'MEDIANOS'"))[0].nombre).toBe('Caninos medianos');
  const antes = await q('SELECT id, codigo FROM trk_categorias ORDER BY id');

  await ejecutarArchivo('009_categorias_v3.sql');

  expect(await categorias()).toEqual(ESPERADO);
  expect(await q('SELECT id, codigo FROM trk_categorias ORDER BY id')).toEqual(antes);
  await kira.reload({ include: ['categoria'] });
  expect(kira.categoria.codigo).toBe('MEDIANOS');
  expect(kira.categoria.nombre).toBe('Caninos raza mediana');
  const cals = await db.TrkCalificacion.findAll({ where: { participante_id: kira.id } });
  expect(cals.map((c) => c.total)).toEqual([80]);
});

test('es reaplicable sin error (columna ya existe)', async () => {
  const antes = await q('SELECT id, codigo FROM trk_categorias ORDER BY id');
  await ejecutarArchivo('009_categorias_v3.sql');
  await ejecutarArchivo('009_categorias_v3.sql');
  expect(await q('SELECT id, codigo FROM trk_categorias ORDER BY id')).toEqual(antes);
  expect(await categorias()).toEqual(ESPERADO);
});
