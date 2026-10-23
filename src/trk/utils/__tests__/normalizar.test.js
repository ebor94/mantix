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
  soloDigitos, normalizarEspecie, normalizarSexo, mapearCategoria, esCategoriaCombinada, telefonoValido,
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
  expect(normalizarEspecie('Canario')).toEqual({ especie: null, extra: null });
  expect(normalizarEspecie('Canguro')).toEqual({ especie: null, extra: null });
  expect(normalizarEspecie('Canina')).toEqual({ especie: 'PERRO', extra: null });
});

test('sexo', () => {
  expect(normalizarSexo('Macho')).toBe('MACHO');
  expect(normalizarSexo('HEMBRA')).toBe('HEMBRA');
  expect(normalizarSexo('')).toBeNull();
});

test('categorías de la hoja (§7.1, v2)', () => {
  expect(mapearCategoria('Perros pequeños.')).toBe('PEQUENOS');
  expect(mapearCategoria('Caninos pequeños')).toBe('PEQUENOS');
  expect(mapearCategoria('Perro pequeño')).toBe('PEQUENOS');
  expect(mapearCategoria('Perros medianos.')).toBe('MEDIANOS');
  expect(mapearCategoria('Caninos medianos')).toBe('MEDIANOS');
  expect(mapearCategoria('mediano')).toBe('MEDIANOS');
  expect(mapearCategoria('Caninos grandes')).toBe('GRANDES');
  expect(mapearCategoria('Felinos')).toBe('FELINOS');
  expect(mapearCategoria('Perros grandes.')).toBe('GRANDES');
  expect(mapearCategoria('PERROS GRANDES')).toBe('GRANDES');
  expect(mapearCategoria('Gaticos.')).toBe('FELINOS');
  expect(mapearCategoria('Disfraz familiar: mascota y acompañante/s.')).toBe('FAMILIAR');
  expect(mapearCategoria('Otra cosa')).toBeNull();
});

test('texto antiguo combinado "pequeños y medianos" → PEQUENOS y se marca como combinado', () => {
  expect(mapearCategoria('Perros pequeños y medianos.')).toBe('PEQUENOS');
  expect(esCategoriaCombinada('Perros pequeños y medianos.')).toBe(true);
  expect(esCategoriaCombinada('Caninos pequeños y medianos')).toBe(true);
  expect(esCategoriaCombinada('Perros pequeños.')).toBe(false);
  expect(esCategoriaCombinada('Perros medianos.')).toBe(false);
  expect(esCategoriaCombinada(undefined)).toBe(false);
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

test('fecha de inscripción imposible en el calendario → null (MySQL DATE)', () => {
  expect(parsearFechaInscripcion('5/13/2026')).toBeNull();
  expect(parsearFechaInscripcion('31/02/2026')).toBeNull();
  expect(parsearFechaInscripcion('octubre 45, 2026')).toBeNull();
  expect(parsearFechaInscripcion('constructor 5, 2026')).toBeNull();
});

test('fecha de inscripción válida en año bisiesto', () => {
  expect(parsearFechaInscripcion('29/02/2028')).toBe('2028-02-29');
  expect(parsearFechaInscripcion('29/02/2026')).toBeNull();
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
  expect(campoDeEncabezado('constructor')).toBeNull();
  expect(campoDeEncabezado('__proto__')).toBeNull();
});

test('razas pequeñas y grandes', () => {
  expect(esRazaPequena('Mini Pinscher')).toBe(true);
  expect(esRazaPequena('Yorkie')).toBe(true);
  expect(esRazaGrande('Doberman')).toBe(true);
  expect(esRazaGrande('Pit bull')).toBe(true);
  expect(esRazaPequena('Criollo')).toBe(false);
});
