// 010 Colores definitivos de la leyenda oficial: solo cambia el color.
const db = require('../../../models');
const { cerrar } = require('../../testing/db');

afterAll(cerrar);

test('cada categoría tiene el color de la leyenda oficial (nombres y orden intactos)', async () => {
  const [filas] = await db.sequelize.query('SELECT codigo, nombre, color, orden FROM trk_categorias ORDER BY orden');
  expect(filas.map((f) => [f.codigo, f.nombre, f.color, f.orden])).toEqual([
    ['MEDIANOS', 'Caninos raza mediana', '#4C9F43', 1],
    ['PEQUENOS', 'Caninos raza pequeña', '#FD7218', 2],
    ['FELINOS', 'Felinos', '#186EDD', 3],
    ['GRANDES', 'Caninos raza grande', '#FED104', 4],
    ['FAMILIAR', 'Disfraz familiar', '#DA1F12', 5]
  ]);
});
