const db = require('../../../models');

const TABLAS = [
  'trk_rubricas', 'trk_criterios', 'trk_categorias', 'trk_participantes', 'trk_accesos',
  'trk_calificaciones', 'trk_calificacion_detalle', 'trk_borradores', 'trk_auditoria', 'trk_evento_estado',
  'trk_ranking_snapshots', 'trk_importaciones', 'trk_migraciones'
];

const q = async (sql, replacements = []) => (await db.sequelize.query(sql, { replacements }))[0];

afterAll(() => db.sequelize.close());

test('existen todas las tablas trk_*', async () => {
  const filas = await q("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name LIKE 'trk\\_%'");
  expect(filas.map((f) => f.t).sort()).toEqual([...TABLAS].sort());
});

test('la vista trk_vw_calificacion_totales existe', async () => {
  const filas = await q("SELECT table_name AS t FROM information_schema.views WHERE table_schema = DATABASE()");
  expect(filas.map((f) => f.t)).toContain('trk_vw_calificacion_totales');
});

test('todo índice de tablas trk_ sigue §8.0 (idx_trk_ / uq_trk_ / fk_trk_)', async () => {
  const filas = await q("SELECT DISTINCT table_name AS t, index_name AS i FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name LIKE 'trk\\_%' AND index_name <> 'PRIMARY'");
  const malos = filas.filter((f) => !/^(idx_trk_|uq_trk_|fk_trk_)/.test(f.i));
  expect(malos).toEqual([]);
});

test('toda llave foránea sigue fk_trk_<tabla>_<referida>', async () => {
  const filas = await q("SELECT table_name AS t, constraint_name AS c FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_type = 'FOREIGN KEY' AND table_name LIKE 'trk\\_%'");
  expect(filas.length).toBeGreaterThanOrEqual(14);
  for (const f of filas) expect(f.c.startsWith(`fk_${f.t}_`)).toBe(true);
});

test('único de calificaciones por participante y jurado', async () => {
  const filas = await q("SELECT index_name AS i, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'trk_calificaciones' AND non_unique = 0 GROUP BY index_name");
  expect(filas).toEqual(expect.arrayContaining([{ i: 'uq_trk_calificaciones_part_jur', cols: 'participante_id,jurado_id' }]));
});

test('clave natural de participantes', async () => {
  const filas = await q("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'trk_participantes' AND index_name = 'uq_trk_participantes_doc_mascota'");
  expect(filas[0].cols).toBe('responsable_documento,mascota_nombre_norm');
});

test('v2.1: único de borradores por participante, jurado y criterio', async () => {
  const filas = await q("SELECT index_name AS i, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'trk_borradores' AND non_unique = 0 GROUP BY index_name");
  expect(filas).toEqual(expect.arrayContaining([{ i: 'uq_trk_borradores_part_jur_crit', cols: 'participante_id,jurado_id,criterio_id' }]));
});

test('v2.1: trk_borradores.puntaje admite NULL (casilla vacía) y tiene sus tres FKs', async () => {
  const [col] = await q("SELECT is_nullable AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'trk_borradores' AND column_name = 'puntaje'");
  expect(col.n).toBe('YES');
  const fks = await q("SELECT constraint_name AS c FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'trk_borradores' AND constraint_type = 'FOREIGN KEY' ORDER BY constraint_name");
  expect(fks.map((f) => f.c)).toEqual(['fk_trk_borradores_criterios', 'fk_trk_borradores_participantes', 'fk_trk_borradores_usuarios']);
});
