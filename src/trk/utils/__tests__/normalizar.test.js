const { normalizarTexto, slug } = require('../normalizar');

test('normalizarTexto quita tildes, mayúsculas y espacios dobles', () => {
  expect(normalizarTexto('  Cateogoría   de PARTICIPACIÓN ')).toBe('cateogoria de participacion');
  expect(normalizarTexto('Ñoño')).toBe('nono');
  expect(normalizarTexto(null)).toBe('');
});

test('slug', () => {
  expect(slug('Jurado Número 1')).toBe('jurado-numero-1');
  expect(slug('***')).toBe('usuario');
});

const {
  soloDigitos, normalizarEspecie, normalizarSexo, mapearCategoria, telefonoValido,
  parsearFechaInscripcion, parsearAutorizacion, primerNombre, campoDeEncabezado, esRazaPequena, esRazaGrande
} = require('../normalizar');

test('documento: solo dígitos (§7.2 "88.251.117")', () => {
  expect(soloDigitos('88.251.117')).toBe('88251117');
  expect(soloDigitos(' 1 234 ')).toBe('1234');
  expect(soloDigitos(undefined)).toBe('');
});

test('especie normalizada y texto extra separado (§7.2 "Perro(cupo lleno)")', () => {
  expect(normalizarEspecie('Perro(cupo lleno)')).toEqual({ especie: 'PERRO', extra: '(cupo lleno)' });
  expect(normalizarEspecie(' gato ')).toEqual({ especie: 'GATO', extra: null });
  expect(normalizarEspecie('Canino')).toEqual({ especie: 'PERRO', extra: null });
  expect(normalizarEspecie('Felino')).toEqual({ especie: 'GATO', extra: null });
  expect(normalizarEspecie('Conejo')).toEqual({ especie: null, extra: null });
});

test('sexo', () => {
  expect(normalizarSexo('Macho')).toBe('MACHO');
  expect(normalizarSexo('HEMBRA')).toBe('HEMBRA');
  expect(normalizarSexo('')).toBeNull();
});

test('categorías de la hoja (§7.1)', () => {
  expect(mapearCategoria('Perros pequeños y medianos.')).toBe('PEQ_MED');
  expect(mapearCategoria('Perros grandes.')).toBe('GRANDES');
  expect(mapearCategoria('PERROS GRANDES')).toBe('GRANDES');
  expect(mapearCategoria('Gaticos.')).toBe('FELINOS');
  expect(mapearCategoria('Disfraz familiar: mascota y acompañante/s.')).toBe('FAMILIAR');
  expect(mapearCategoria('Otra cosa')).toBeNull();
});

test('teléfono válido = 10 dígitos (§7.2 "302268158")', () => {
  expect(telefonoValido('3001234567')).toBe(true);
  expect(telefonoValido('302268158')).toBe(false);
  expect(telefonoValido('30012345678')).toBe(false);
});

test('fecha de inscripción', () => {
  expect(parsearFechaInscripcion('octubre 5, 2026')).toBe('2026-10-05');
  expect(parsearFechaInscripcion('Septiembre 30, 2026')).toBe('2026-09-30');
  expect(parsearFechaInscripcion('5/10/2026 14:33:00')).toBe('2026-10-05');
  expect(parsearFechaInscripcion('ayer')).toBeNull();
});

test('autorizaciones', () => {
  expect(parsearAutorizacion('on')).toBe(true);
  expect(parsearAutorizacion('Sí')).toBe(true);
  expect(parsearAutorizacion('')).toBe(false);
});

test('primer nombre', () => {
  expect(primerNombre('ANA MARÍA Pérez')).toBe('Ana');
  expect(primerNombre('')).toBe('');
});

test('encabezados por nombre normalizado, incluido "Cateogoría" (sic)', () => {
  expect(campoDeEncabezado('Cateogoría de participación')).toBe('categoria');
  expect(campoDeEncabezado('  Nombre   del responsable ')).toBe('responsable_nombre');
  expect(campoDeEncabezado('FOTOGRAFÍA PARTICIPANTE')).toBe('foto_inscripcion_url');
  expect(campoDeEncabezado('Telefono')).toBe('responsable_telefono');
  expect(campoDeEncabezado('')).toBe('notas');
  expect(campoDeEncabezado('Columna rara')).toBeNull();
});

test('razas pequeñas y grandes', () => {
  expect(esRazaPequena('Mini Pinscher')).toBe(true);
  expect(esRazaPequena('Yorkie')).toBe(true);
  expect(esRazaGrande('Doberman')).toBe(true);
  expect(esRazaGrande('Pit bull')).toBe(true);
  expect(esRazaPequena('Criollo')).toBe(false);
});
