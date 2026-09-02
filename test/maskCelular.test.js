const maskCelular = require('../src/utils/maskCelular');

describe('maskCelular', () => {
  test('enmascara todo menos los últimos 4 dígitos', () => {
    expect(maskCelular('3151234567')).toBe('••••••4567');
  });
  test('número corto (<=4) queda intacto', () => {
    expect(maskCelular('123')).toBe('123');
  });
  test('nulo/vacío devuelve cadena vacía', () => {
    expect(maskCelular('')).toBe('');
    expect(maskCelular(null)).toBe('');
    expect(maskCelular(undefined)).toBe('');
  });
  test('ignora no-dígitos al contar pero conserva solo dígitos', () => {
    expect(maskCelular('315-123-4567')).toBe('••••••4567');
  });
});
