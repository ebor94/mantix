// Formatos reales de exportación: Excel en español (";"), UTF-8 con BOM y windows-1252.
const { analizarCsv, decodificarCsv, detectarDelimitador } = require('../importador.service');

const ENCABEZADO = ['Nombre del responsable', 'Documento de identidad', 'Teléfono', 'Nombre de la mascota', 'Especie', 'Raza', 'Sexo', 'Categoría de participación'];
const FILAS = [
  ['Ana Muñoz', '1001', '3001234567', 'Peña', 'Perro', 'Pug', 'Hembra', 'Caninos raza pequeña'],
  ['Luis Pérez', '1002', '3001234568', 'Toño', 'Perro', 'Beagle', 'Macho', 'Caninos raza mediana'],
  ['Sofía Ríos', '1003', '3001234569', 'Misú', 'Gato', 'Criollo', 'Hembra', 'Felinos'],
  ['Juan Gómez', '1004', '3001234570', 'Thor', 'Perro', 'Gran danés', 'Macho', 'Caninos raza grande'],
  ['Eva Díaz', '1005', '3001234571', 'Lola', 'Perro', 'Criollo', 'Hembra', 'Disfraz familiar']
];
const csv = (sep) => [ENCABEZADO, ...FILAS].map((f) => f.join(sep)).join('\r\n') + '\r\n';

function comprobar({ filas, resumen }) {
  expect(resumen.total).toBe(5);
  expect(filas.map((f) => f.datos.categoria_codigo)).toEqual(['PEQUENOS', 'MEDIANOS', 'FELINOS', 'GRANDES', 'FAMILIAR']);
  expect(filas[0].datos).toMatchObject({ responsable_nombre: 'Ana Muñoz', mascota_nombre: 'Peña', responsable_documento: '1001', sexo: 'HEMBRA' });
  expect(filas[3].datos.raza).toBe('Gran danés');
}

test('CSV separado por punto y coma (Excel en español)', () => {
  expect(detectarDelimitador(csv(';'))).toBe(';');
  comprobar(analizarCsv(Buffer.from(csv(';'), 'utf8')));
});

test('CSV separado por tabulador', () => {
  comprobar(analizarCsv(Buffer.from(csv('\t'), 'utf8')));
});

test('CSV con coma sigue funcionando', () => {
  expect(detectarDelimitador(csv(','))).toBe(',');
  comprobar(analizarCsv(Buffer.from(csv(','), 'utf8')));
});

test('UTF-8 con BOM: el primer encabezado se reconoce', () => {
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv(';'), 'utf8')]);
  expect(decodificarCsv(buf).charCodeAt(0)).toBe('N'.charCodeAt(0));
  comprobar(analizarCsv(buf));
});

test('windows-1252 / Latin-1: "Caninos raza pequeña" y tildes se decodifican bien', () => {
  const buf = Buffer.from(csv(';'), 'latin1');
  expect(() => new TextDecoder('utf-8', { fatal: true }).decode(buf)).toThrow();
  expect(decodificarCsv(buf)).toContain('Caninos raza pequeña');
  comprobar(analizarCsv(buf));
});

test('una coma dentro de un CSV con ";" no confunde la detección', () => {
  const texto = csv(';').replace('Gran danés', 'Gran danés, mezcla');
  expect(detectarDelimitador(texto)).toBe(';');
  expect(analizarCsv(Buffer.from(texto, 'utf8')).filas[3].datos.raza).toBe('Gran danés, mezcla');
});
