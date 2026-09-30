const { plantillaReglas } = require('../empresarialTemplates');
const { parseReglas } = require('../convenioRules');

describe('plantillaReglas', () => {
  test.each(['UNIPERSONAL', 'BASICO', 'UNIFAMILIAR'])('%s produce reglas parseables por el motor', (tipo) => {
    const reglas = plantillaReglas(tipo);
    expect(reglas).toBeTruthy();
    expect(() => parseReglas(reglas)).not.toThrow();
  });

  test('tipo desconocido lanza', () => {
    expect(() => plantillaReglas('NOPE')).toThrow();
  });
});
