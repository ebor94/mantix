const { normalizarPlaca, placaSql } = require('../utils/placa');
const { patronContiene } = require('../utils/texto');

test.each([
  ['abc-123', 'ABC123'],
  [' abc 12d ', 'ABC12D'],
  ['ABC123', 'ABC123'],
  [null, ''],
  [undefined, ''],
])('normalizarPlaca(%p) → %p', (entrada, esperado) => {
  expect(normalizarPlaca(entrada)).toBe(esperado);
});

test('placaSql aplica la misma normalización a una columna', () => {
  expect(placaSql('v.placa')).toBe("UPPER(REPLACE(REPLACE(v.placa, ' ', ''), '-', ''))");
});

test('patronContiene escapa los comodines de LIKE', () => {
  expect(patronContiene('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  expect(patronContiene('maría')).toBe('%maría%');
});
