const { slug, nombreFotoZip } = require('../dominio/nombresArchivo');

test.each([
  ['Luna', 'luna'],
  ['  Señor Ñandú  ', 'senor-nandu'],
  ['Max & Rocky!!', 'max-rocky'],
  ['🐾', 'companero'],
])('slug(%p) = %p', (entrada, esperado) => expect(slug(entrada)).toBe(esperado));

test('nombre dentro del ZIP: cedula_orden_nombre-companero.jpg', () => {
  expect(nombreFotoZip({ cedula: '1090000001', orden: 2, nombre: 'Niña Bonita' }))
    .toBe('1090000001_2_nina-bonita.jpg');
});
