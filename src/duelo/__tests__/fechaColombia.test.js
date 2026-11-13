const { formatearFechaColombia } = require('../dominio/fechaColombia');

test('convierte el instante a hora de Colombia (UTC-5)', () => {
  expect(formatearFechaColombia(new Date('2026-11-14T15:30:00Z'))).toBe('2026-11-14 10:30');
});

test('después de las 19:00 en Colombia sigue siendo el mismo día', () => {
  expect(formatearFechaColombia(new Date('2026-11-15T01:10:00Z'))).toBe('2026-11-14 20:10');
});

test('cruza el cambio de año con rellenos de ceros', () => {
  expect(formatearFechaColombia(new Date('2027-01-01T03:05:00Z'))).toBe('2026-12-31 22:05');
});

test('null, indefinido o fecha inválida dan cadena vacía', () => {
  expect(formatearFechaColombia(null)).toBe('');
  expect(formatearFechaColombia(undefined)).toBe('');
  expect(formatearFechaColombia(new Date('no es fecha'))).toBe('');
});
