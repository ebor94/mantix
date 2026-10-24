// 007 Rúbrica v2: criterios confirmados por la organización y limpieza de calificaciones previas.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../../../models');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante, categoria, criteriosDe, calificar, borrador } = require('../../testing/fabricas');

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
  ['CREATIVIDAD', 'Creatividad', 'Creatividad, elaboración y originalidad del disfraz', 50, 1, 1],
  ['BIENESTAR', 'Bienestar', 'Seguridad, comodidad y bienestar de la mascota; un disfraz que le permita movilidad', 30, 2, 2],
  ['PASARELA', 'Pasarela', 'Participación, vínculo con el público y desarrollo de la pasarela de la mascota y su tutor o la familia', 20, 3, null]
];

async function criteriosPorRubrica() {
  const filas = await q('SELECT r.codigo AS rubrica, c.codigo, c.nombre, c.descripcion, c.puntaje_max, c.orden, c.peso_desempate FROM trk_criterios c JOIN trk_rubricas r ON r.id = c.rubrica_id ORDER BY r.codigo, c.orden');
  const por = {};
  for (const f of filas) (por[f.rubrica] ||= []).push([f.codigo, f.nombre, f.descripcion, f.puntaje_max, f.orden, f.peso_desempate]);
  return por;
}

beforeEach(limpiar);
// Reaplica 008 (orden/nombres v2): se restaura v3 (009) para los demás archivos de prueba.
afterAll(async () => {
  await ejecutarArchivo('009_categorias_v3.sql');
  await cerrar();
});

test('ambas rúbricas tienen exactamente Creatividad 50, Bienestar 30 y Pasarela 20 (suma 100, desempate 1, 2, NULL)', async () => {
  const por = await criteriosPorRubrica();
  expect(Object.keys(por).sort()).toEqual(['FAMILIAR', 'INDIVIDUAL']);
  for (const rubrica of ['INDIVIDUAL', 'FAMILIAR']) {
    expect(por[rubrica]).toEqual(ESPERADO);
    expect(por[rubrica].reduce((s, c) => s + c[3], 0)).toBe(100);
  }
});

test('los códigos anteriores ya no existen', async () => {
  const [{ n }] = await q("SELECT COUNT(*) AS n FROM trk_criterios WHERE codigo IN ('SEGURIDAD', 'ELABORACION', 'INTEGRACION')");
  expect(Number(n)).toBe(0);
});

test('aplicada sobre una BD con la rúbrica de 003 y datos, borra calificaciones, borradores, snapshots y estado de ranking', async () => {
  // Reconstruye el estado previo: rúbrica de 003 (4/5 criterios) con calificaciones hechas con ella.
  await q("DELETE FROM trk_criterios WHERE codigo = 'BIENESTAR'");
  await ejecutarArchivo('003_seed_rubricas.sql');
  const jurado = await crearOperativo('TRK_JURADO');
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO', desempate_manual: 1 });
  const luna = await crearParticipante({ mascota_nombre: 'Luna', estado: 'PRESENTADO', categoriaCodigo: 'FAMILIAR' });
  expect((await criteriosDe(kira)).map((c) => c.codigo)).toEqual(['CREATIVIDAD', 'SEGURIDAD', 'ELABORACION', 'PASARELA']);
  await calificar(kira, jurado.usuario, { CREATIVIDAD: 30, SEGURIDAD: 25, ELABORACION: 15, PASARELA: 10 });
  await calificar(luna, jurado.usuario, { CREATIVIDAD: 20, SEGURIDAD: 20, ELABORACION: 10, PASARELA: 5, INTEGRACION: 10 });
  await borrador(luna, jurado.usuario, { SEGURIDAD: 12, INTEGRACION: 7 });
  const cat = await categoria('PEQUENOS');
  await cat.update({ ranking_publicado: true });
  await q('INSERT INTO trk_ranking_snapshots (categoria_id, datos) VALUES (?, ?)', [cat.id, '{}']);
  await q("UPDATE trk_evento_estado SET modo_pantalla = 'RANKING', categoria_pantalla_id = ? WHERE id = 1", [cat.id]);

  await ejecutarArchivo('007_rubrica_v2.sql');
  // 003 reaplicado reintroduce PEQ_MED y el orden v1 de categorías; 008 + 009 lo dejan como en producción.
  await ejecutarArchivo('008_categorias_v2.sql');
  await ejecutarArchivo('009_categorias_v3.sql');

  for (const tabla of ['trk_borradores', 'trk_calificacion_detalle', 'trk_calificaciones', 'trk_ranking_snapshots']) {
    const [{ n }] = await q(`SELECT COUNT(*) AS n FROM ${tabla}`);
    expect([tabla, Number(n)]).toEqual([tabla, 0]);
  }
  const [{ n: publicadas }] = await q('SELECT COUNT(*) AS n FROM trk_categorias WHERE ranking_publicado = 1');
  expect(Number(publicadas)).toBe(0);
  const [{ n: conDesempate }] = await q('SELECT COUNT(*) AS n FROM trk_participantes WHERE desempate_manual IS NOT NULL');
  expect(Number(conDesempate)).toBe(0);
  expect(await q('SELECT modo_pantalla, categoria_pantalla_id FROM trk_evento_estado')).toEqual([{ modo_pantalla: 'PASARELA', categoria_pantalla_id: null }]);
  const por = await criteriosPorRubrica();
  expect(por.INDIVIDUAL).toEqual(ESPERADO);
  expect(por.FAMILIAR).toEqual(ESPERADO);
  // Los participantes no se tocan.
  expect(await db.TrkParticipante.count()).toBe(2);
});

test('es reaplicable sin error (no rompe la unicidad ni duplica criterios)', async () => {
  await ejecutarArchivo('007_rubrica_v2.sql');
  const por = await criteriosPorRubrica();
  expect(por.INDIVIDUAL).toEqual(ESPERADO);
  expect(por.FAMILIAR).toEqual(ESPERADO);
});
