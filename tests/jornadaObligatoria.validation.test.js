const v = require('../src/sv/validations/jornadaObligatoria.validation');

describe('registrarAusencia', () => {
  test('valida payload correcto', () => {
    const { error, value } = v.registrarAusencia.validate({
      tipo: 'PERMISO', motivo: 'Cita médica programada'
    });
    expect(error).toBeUndefined();
    expect(value.tipo).toBe('PERMISO');
  });

  test('rechaza tipo desconocido', () => {
    const { error } = v.registrarAusencia.validate({
      tipo: 'VACACIONES', motivo: 'blah blah'
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(['tipo']);
  });

  test('rechaza motivo con menos de 5 chars', () => {
    const { error } = v.registrarAusencia.validate({
      tipo: 'OTRO', motivo: 'hi'
    });
    expect(error).toBeDefined();
    expect(error.details[0].path).toEqual(['motivo']);
  });

  test('rechaza motivo mayor a 500 chars', () => {
    const { error } = v.registrarAusencia.validate({
      tipo: 'OTRO', motivo: 'x'.repeat(501)
    });
    expect(error).toBeDefined();
  });

  test('exige tipo y motivo obligatorios', () => {
    const { error } = v.registrarAusencia.validate({});
    expect(error).toBeDefined();
    expect(error.details.length).toBeGreaterThanOrEqual(2);
  });
});
