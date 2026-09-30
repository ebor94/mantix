const db = require('../index');

describe('modelos canal empresarial', () => {
  test('Empresa tiene columnas de canal empresarial', () => {
    const attrs = db.Empresa.rawAttributes;
    expect(attrs.rangoAfiliados.field).toBe('rango_afiliados');
    expect(attrs.vigenciaInicio.field).toBe('vigencia_inicio');
    expect(attrs.vigenciaCierre.field).toBe('vigencia_cierre');
  });

  test('EmpresaPlan mapea columnas snake_case', () => {
    const attrs = db.EmpresaPlan.rawAttributes;
    expect(attrs.empresaId.field).toBe('empresa_id');
    expect(attrs.planTipo.field).toBe('plan_tipo');
    expect(attrs.valorMensual.field).toBe('valor_mensual');
    expect(db.EmpresaPlan.options.tableName).toBe('empresa_planes');
  });

  test('EmpresarialParametro mapea columnas y tabla', () => {
    const attrs = db.EmpresarialParametro.rawAttributes;
    expect(attrs.valorAdicionalMenor50.field).toBe('valor_adicional_menor50');
    expect(attrs.preciosEstandar.field).toBe('precios_estandar');
    expect(db.EmpresarialParametro.options.tableName).toBe('empresarial_parametros');
  });

  test('Empresa hasMany planes', () => {
    expect(db.Empresa.associations.planes).toBeTruthy();
    expect(db.Empresa.associations.planes.target.name).toBe('EmpresaPlan');
  });
});
