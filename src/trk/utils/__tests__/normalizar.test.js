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
