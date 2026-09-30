const { crearEmpresaAdminSchema, editarEmpresaAdminSchema, editarPlanSchema, parametroSchema } = require('../empresaAdmin.validation');

describe('crearEmpresaAdminSchema', () => {
  test('válido', () => {
    const { error } = crearEmpresaAdminSchema.validate({
      nit: '900123456', nombre: 'ACME SAS', rangoAfiliados: 'R7',
      vigenciaInicio: '2026-01-01', vigenciaCierre: '2027-01-01'
    });
    expect(error).toBeUndefined();
  });
  test('rango inválido', () => {
    const { error } = crearEmpresaAdminSchema.validate({
      nit: '900123456', nombre: 'ACME', rangoAfiliados: 'R99',
      vigenciaInicio: '2026-01-01', vigenciaCierre: '2027-01-01'
    });
    expect(error).toBeTruthy();
  });
  test('cierre antes que inicio', () => {
    const { error } = crearEmpresaAdminSchema.validate({
      nit: '900123456', nombre: 'ACME', rangoAfiliados: 'R7',
      vigenciaInicio: '2027-01-01', vigenciaCierre: '2026-01-01'
    });
    expect(error).toBeTruthy();
  });
  test('slug/asesorId/publicoActivo válidos', () => {
    const { error } = crearEmpresaAdminSchema.validate({
      nit: '900123456', nombre: 'ACME SAS', rangoAfiliados: 'R7',
      vigenciaInicio: '2026-01-01', vigenciaCierre: '2027-01-01',
      slug: 'acme-sas', asesorId: 5, publicoActivo: 1
    });
    expect(error).toBeUndefined();
  });
  test('slug inválido', () => {
    const { error } = crearEmpresaAdminSchema.validate({
      nit: '900123456', nombre: 'ACME SAS', rangoAfiliados: 'R7',
      vigenciaInicio: '2026-01-01', vigenciaCierre: '2027-01-01',
      slug: 'Bad Slug!'
    });
    expect(error).toBeTruthy();
  });
});

describe('editarEmpresaAdminSchema', () => {
  test('slug/asesorId/publicoActivo válidos', () => {
    const { error } = editarEmpresaAdminSchema.validate({
      slug: 'acme-sas', asesorId: 5, publicoActivo: 1
    });
    expect(error).toBeUndefined();
  });
  test('slug inválido', () => {
    const { error } = editarEmpresaAdminSchema.validate({ slug: 'Bad Slug!' });
    expect(error).toBeTruthy();
  });
});

describe('editarPlanSchema', () => {
  test('valor y reglas', () => {
    const { error } = editarPlanSchema.validate({ valorMensual: 20000, reglas: { titular: {} }, activo: 1 });
    expect(error).toBeUndefined();
  });
  test('valor negativo inválido', () => {
    const { error } = editarPlanSchema.validate({ valorMensual: -1, reglas: {}, activo: 1 });
    expect(error).toBeTruthy();
  });
});

describe('parametroSchema', () => {
  test('válido con preciosEstandar', () => {
    const { error } = parametroSchema.validate({
      anio: 2026, valorAdicionalMenor50: 5800, valorAdicionalMayor50: 6800, valorAsistencia: 3000,
      preciosEstandar: { R7: { UNIPERSONAL: 1, BASICO: 2, UNIFAMILIAR: 3 }, R15: { UNIPERSONAL: 1, BASICO: 2, UNIFAMILIAR: 3 } }
    });
    expect(error).toBeUndefined();
  });
});
