const db = require('../../../models');

const q = async (sql, replacements = []) => (await db.sequelize.query(sql, { replacements }))[0];
const permisos = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

afterAll(() => db.sequelize.close());

test('cada rúbrica suma 100 (dato de BD, no código)', async () => {
  const filas = await q('SELECT r.codigo, SUM(c.puntaje_max) AS total, COUNT(*) AS n FROM trk_rubricas r JOIN trk_criterios c ON c.rubrica_id = r.id GROUP BY r.codigo ORDER BY r.codigo');
  expect(filas.map((f) => [f.codigo, Number(f.total), Number(f.n)])).toEqual([
    ['FAMILIAR', 100, 5],
    ['INDIVIDUAL', 100, 4]
  ]);
});

test('desempate: Creatividad primero, Seguridad segundo, en ambas rúbricas', async () => {
  const filas = await q('SELECT r.codigo AS rubrica, c.codigo, c.peso_desempate AS peso FROM trk_criterios c JOIN trk_rubricas r ON r.id = c.rubrica_id WHERE c.peso_desempate IS NOT NULL ORDER BY r.codigo, c.peso_desempate');
  expect(filas.map((f) => `${f.rubrica}:${f.codigo}:${f.peso}`)).toEqual([
    'FAMILIAR:CREATIVIDAD:1', 'FAMILIAR:SEGURIDAD:2', 'INDIVIDUAL:CREATIVIDAD:1', 'INDIVIDUAL:SEGURIDAD:2'
  ]);
});

test('categorías con su rúbrica, abiertas, sin publicar y 3 puestos premiados', async () => {
  const filas = await q('SELECT c.codigo, r.codigo AS rubrica, c.abierta, c.ranking_publicado, c.puestos_premiados FROM trk_categorias c JOIN trk_rubricas r ON r.id = c.rubrica_id ORDER BY c.orden');
  expect(filas.map((f) => [f.codigo, f.rubrica, Number(f.abierta), Number(f.ranking_publicado), Number(f.puestos_premiados)])).toEqual([
    ['PEQ_MED', 'INDIVIDUAL', 1, 0, 3],
    ['GRANDES', 'INDIVIDUAL', 1, 0, 3],
    ['FELINOS', 'INDIVIDUAL', 1, 0, 3],
    ['FAMILIAR', 'FAMILIAR', 1, 0, 3]
  ]);
});

test('roles operativos TRK con su permiso', async () => {
  const filas = await q("SELECT nombre, permisos FROM roles WHERE nombre LIKE 'TRK\\_%' ORDER BY nombre");
  expect(filas.map((f) => [f.nombre, permisos(f.permisos).trk])).toEqual([
    ['TRK_CABINA', { cabina: true }],
    ['TRK_COMENTARISTA', { pasarela: true }],
    ['TRK_JURADO', { calificar: true }]
  ]);
});

test('roles admin existentes reciben permisos trk sin perder los suyos', async () => {
  const [rol] = await q("SELECT permisos FROM roles WHERE nombre = 'Administrador'");
  expect(permisos(rol.permisos).trk).toEqual({
    administrar: true, importar: true, editar: true, calificaciones_desbloquear: true,
    publicar: true, exportar: true, pasarela: true, cabina: true
  });
});

test('existe la fila única de estado del evento', async () => {
  const filas = await q('SELECT id, modo_pantalla FROM trk_evento_estado');
  expect(filas).toEqual([{ id: 1, modo_pantalla: 'PASARELA' }]);
});
