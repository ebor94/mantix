const db = require('../index');

test('EmpresaNomina mapea columnas y tabla', () => {
  const a = db.EmpresaNomina.rawAttributes;
  expect(a.empresaId.field).toBe('empresa_id');
  expect(a.numeroDocumento.field).toBe('numero_documento');
  expect(a.planTipo.field).toBe('plan_tipo');
  expect(db.EmpresaNomina.options.tableName).toBe('empresa_nomina');
});
