const { primerTelefonoValido, formatearNombre } = require('../src/sv/utils/contratante');

describe('primerTelefonoValido', () => {
  test.each([
    ['3001234567', '3001234567'],
    ['300 123 4567', '3001234567'],
    ['300-123-4567', '3001234567'],
    ['+57 300 123 4567', '3001234567'],
    ['3001234567 / 3109876543', '3001234567'],
    ['3001234567 - 3109876543', '3001234567'],
    ['abc / 3109876543', '3109876543'],
    ['12; 3109876543', '3109876543']
  ])('%s → %s', (entrada, esperado) => {
    expect(primerTelefonoValido(entrada)).toBe(esperado);
  });

  test.each([[null], [undefined], [''], ['   '], ['abc'], ['12']])('%p → null', (entrada) => {
    expect(primerTelefonoValido(entrada)).toBeNull();
  });
});

describe('formatearNombre', () => {
  test('mayúscula inicial en cada palabra y espacios simples', () => {
    expect(formatearNombre('CASTILLA MORENO ANA CELIS')).toBe('Castilla Moreno Ana Celis');
    expect(formatearNombre('  luz   dary  pérez ')).toBe('Luz Dary Pérez');
    expect(formatearNombre('ÁNGEL')).toBe('Ángel');
  });
  test('vacío si no hay nombre', () => {
    expect(formatearNombre(null)).toBe('');
    expect(formatearNombre('   ')).toBe('');
  });
  test('máximo 100 caracteres', () => {
    expect(formatearNombre('a'.repeat(150))).toHaveLength(100);
  });
});
