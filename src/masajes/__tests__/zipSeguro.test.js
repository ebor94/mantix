const { inspeccionarZip } = require('../utils/zipSeguro');
const { crearXlsx } = require('../testing/xlsx');
const { zipFalso } = require('../testing/zip');


const motivo = (fn) => { try { fn(); } catch (e) { return e.errors && e.errors[0].motivo; } return 'NO_LANZO'; };

test('un xlsx real pasa la inspección', async () => {
  const buf = await crearXlsx({ filas: [[1, 'Ana', 'Asesora', '3152884079', 'ana@losolivos.co']] });
  expect(() => inspeccionarZip(buf)).not.toThrow();
  expect(inspeccionarZip(buf).entradas).toBeGreaterThan(3);
});

test.each([
  ['texto plano', Buffer.from('NOMBRE,CELULAR\nAna,3152884079')],
  ['vacío', Buffer.alloc(0)],
  ['solo la firma PK', Buffer.from('PK\x03\x04')],
  ['no es Buffer', 'PK\x03\x04hola'],
])('%s → ARCHIVO_INVALIDO', (_, buf) => {
  expect(motivo(() => inspeccionarZip(buf))).toBe('ARCHIVO_INVALIDO');
});

test('declara más de 50 MB descomprimido → ARCHIVO_SOSPECHOSO (zip bomb)', () => {
  const bomba = zipFalso([{ nombre: 'xl/worksheets/sheet1.xml', declarado: 60 * 1024 * 1024 }]);
  expect(motivo(() => inspeccionarZip(bomba))).toBe('ARCHIVO_SOSPECHOSO');
});

test('la suma de varias entradas también cuenta', () => {
  const muchas = zipFalso(Array.from({ length: 6 }, (_, i) => ({ nombre: `x${i}.xml`, declarado: 10 * 1024 * 1024 })));
  expect(motivo(() => inspeccionarZip(muchas))).toBe('ARCHIVO_SOSPECHOSO');
});

test('más de 200 entradas → ARCHIVO_SOSPECHOSO', () => {
  const z = zipFalso(Array.from({ length: 201 }, (_, i) => ({ nombre: `e${i}`, declarado: 1 })));
  expect(motivo(() => inspeccionarZip(z))).toBe('ARCHIVO_SOSPECHOSO');
});

test('tamaño ZIP64 (0xFFFFFFFF) → ARCHIVO_SOSPECHOSO', () => {
  const z = zipFalso([{ nombre: 'x.xml', declarado: 0xffffffff }]);
  expect(motivo(() => inspeccionarZip(z))).toBe('ARCHIVO_SOSPECHOSO');
});

test('directorio central que apunta fuera del archivo → ARCHIVO_INVALIDO', () => {
  const z = zipFalso([{ nombre: 'x.xml', declarado: 10 }]);
  z.writeUInt32LE(z.length + 1000, z.length - 22 + 16); // offset del directorio central
  expect(motivo(() => inspeccionarZip(z))).toBe('ARCHIVO_INVALIDO');
});
