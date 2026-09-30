const svc = require('../empresarialRegistro.service');

const PARAMS = { valorAdicionalMenor50: 5800, valorAdicionalMayor50: 6800, valorAsistencia: 3000 };
const PLAN = { valorMensual: 20000 };
const EMPRESA = { vigenciaCierre: '2027-01-31' };

describe('construirContratoEmpresarial', () => {
  test('mapea al shape de ContratoValor con prorrateo', () => {
    const c = svc.construirContratoEmpresarial({
      plan: PLAN, parametros: PARAMS,
      beneficiariosAdicionales: [{ edad: 30 }, { edad: 55 }], // 5800 + 6800
      asistencia: true, valorSegurosMensual: 1000,
      empresa: EMPRESA, fechaRegistro: '2026-12-05' // 2 meses hasta 2027-01-31
    });
    // paquete = 20000 + 12600 + 3000 + 1000 = 36600 ; meses = 2
    expect(c.tarifaId).toBeNull();
    expect(c.valorPlanExequial).toBe(20000);
    expect(c.valorAdicionales).toBe(12600);
    expect(c.valorSeguros).toBe(1000);
    expect(c.periodicidad).toBe('MENSUAL');
    expect(c.nCuotas).toBe(2);
    expect(c.valorCuota).toBe(36600);
    expect(c.valorTotal).toBe(73200);
  });
});
