const { esOrigenPublico, esOrigenAsesor, ORIGEN_ASESOR } = require('../origen');

describe('utils/origen', () => {
  test('CONVENIO_PUBLICO es público', () => {
    expect(esOrigenPublico('CONVENIO_PUBLICO')).toBe(true);
    expect(esOrigenPublico('ASESOR')).toBe(false);
  });

  test('VEOLIA y CONVENIO siguen siendo públicos (no se rompe semántica previa)', () => {
    expect(esOrigenPublico('VEOLIA')).toBe(true);
    expect(esOrigenPublico('CONVENIO')).toBe(true);
  });

  test('esOrigenAsesor solo es true para ASESOR', () => {
    expect(esOrigenAsesor('ASESOR')).toBe(true);
    expect(esOrigenAsesor('CONVENIO_PUBLICO')).toBe(false);
    expect(ORIGEN_ASESOR).toBe('ASESOR');
  });

  test('sigue funcionando recibiendo el objeto afiliado completo (uso real en controladores)', () => {
    expect(esOrigenPublico({ origen: 'CONVENIO_PUBLICO' })).toBe(true);
    expect(esOrigenPublico({ origen: 'ASESOR' })).toBe(false);
    expect(esOrigenPublico(null)).toBe(false);
  });
});
