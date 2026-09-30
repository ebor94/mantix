const svc = require('../empresarialPricing.service');

const PARAMS = { valorAdicionalMenor50: 5800, valorAdicionalMayor50: 6800, valorAsistencia: 3000 };

describe('mesesRestantes', () => {
  test('10-jun-2026 a 31-ene-2027 = 8', () => {
    expect(svc.mesesRestantes('2026-06-10', '2027-01-31')).toBe(8);
  });
  test('05-dic-2026 a 31-ene-2027 = 2', () => {
    expect(svc.mesesRestantes('2026-12-05', '2027-01-31')).toBe(2);
  });
  test('mismo mes = 1', () => {
    expect(svc.mesesRestantes('2027-01-05', '2027-01-31')).toBe(1);
  });
  test('registro posterior al cierre = 0', () => {
    expect(svc.mesesRestantes('2027-02-01', '2027-01-31')).toBe(0);
  });
});

describe('valorAdicionalPorEdad', () => {
  test('menor de 50', () => expect(svc.valorAdicionalPorEdad(49, PARAMS)).toBe(5800));
  test('50 a 64', () => {
    expect(svc.valorAdicionalPorEdad(50, PARAMS)).toBe(6800);
    expect(svc.valorAdicionalPorEdad(64, PARAMS)).toBe(6800);
  });
});

describe('calcularPaqueteMensual', () => {
  test('plan + 2 adicionales (uno <50, uno 50-64) + asistencia + seguros', () => {
    const plan = { valorMensual: 20000 };
    const beneficiariosAdicionales = [{ edad: 30 }, { edad: 55 }];
    const r = svc.calcularPaqueteMensual({
      plan, beneficiariosAdicionales, asistencia: true, parametros: PARAMS, valorSegurosMensual: 1000
    });
    // 20000 + 5800 + 6800 + 3000 + 1000 = 36600
    expect(r).toBe(36600);
  });
  test('sin adicionales ni asistencia ni seguros = solo plan', () => {
    const r = svc.calcularPaqueteMensual({
      plan: { valorMensual: 20000 }, beneficiariosAdicionales: [], asistencia: false, parametros: PARAMS, valorSegurosMensual: 0
    });
    expect(r).toBe(20000);
  });
});

describe('calcularTotalEmpresarial', () => {
  test('prorratea el paquete mensual por meses restantes', () => {
    const r = svc.calcularTotalEmpresarial({
      plan: { valorMensual: 20000 },
      empresa: { vigenciaCierre: '2027-01-31' },
      fechaRegistro: '2026-12-05',
      beneficiariosAdicionales: [],
      asistencia: false,
      parametros: PARAMS,
      valorSegurosMensual: 0
    });
    expect(r.mesesRestantes).toBe(2);
    expect(r.paqueteMensual).toBe(20000);
    expect(r.total).toBe(40000);
  });
});
