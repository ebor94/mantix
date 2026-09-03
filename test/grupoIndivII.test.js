const { validarGrupoIndivII } = require('../src/validations/grupoIndivII');

const deLey = (parentesco, edad) => ({ tipoBeneficiario: 'DE_LEY', parentesco, edad });

describe('validarGrupoIndivII', () => {
  test('grupo no INDIV II: no valida (no lanza)', () => {
    expect(() => validarGrupoIndivII('UNIFAMILIAR', [deLey('PADRE', 40)])).not.toThrow();
  });
  test('PADRE de ley en 75-80: ok (bordes inclusive)', () => {
    expect(() => validarGrupoIndivII('UNIFAMILIAR_INDIV_II', [deLey('PADRE', 75)])).not.toThrow();
    expect(() => validarGrupoIndivII('BASICO_INDIV_II', [deLey('MADRE', 80)])).not.toThrow();
    expect(() => validarGrupoIndivII('UNIFAMILIAR_INDIV_II', [deLey('MADRE', 77)])).not.toThrow();
  });
  test('PADRE/MADRE de ley < 75: lanza 400 con el mensaje exacto', () => {
    expect(() => validarGrupoIndivII('UNIFAMILIAR_INDIV_II', [deLey('PADRE', 74)]))
      .toThrow('La edad del padre o madre no aplica en este plan (debe estar entre 75 y 80 años).');
  });
  test('PADRE/MADRE de ley > 80: lanza', () => {
    expect(() => validarGrupoIndivII('BASICO_INDIV_II', [deLey('MADRE', 81)])).toThrow();
  });
  test('PADRE ADICIONAL: no lo valida (solo DE_LEY)', () => {
    expect(() => validarGrupoIndivII('UNIFAMILIAR_INDIV_II', [{ tipoBeneficiario: 'ADICIONAL', parentesco: 'PADRE', edad: 40 }])).not.toThrow();
  });
  test('otros parentescos DE_LEY: no aplican esta banda', () => {
    expect(() => validarGrupoIndivII('BASICO_INDIV_II', [deLey('HIJO', 10)])).not.toThrow();
  });
});
