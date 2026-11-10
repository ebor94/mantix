const { pascua, festivosDelAnio, festivosEntre } = require('../dominio/festivos');

describe('pascua (domingo de Resurrección, calendario gregoriano)', () => {
  test.each([
    [2008, '2008-03-23'], [2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'],
    [2027, '2027-03-28'], [2028, '2028-04-16'], [2030, '2030-04-21'], [2038, '2038-04-25'],
  ])('%i → %s', (anio, esperado) => expect(pascua(anio)).toBe(esperado));
});

describe('festivosDelAnio', () => {
  test('2026: 19 festivos, incluido el nuevo de la Virgen de Chiquinquirá (Ley 2578 de 2026)', () => {
    expect(festivosDelAnio(2026)).toEqual([
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18',
      '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-13', '2026-07-20', '2026-08-07', '2026-08-17',
      '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
    ]);
  });

  test('2027: Semana Santa en marzo y dos lunes festivos seguidos en julio', () => {
    expect(festivosDelAnio(2027)).toEqual([
      '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01', '2027-05-10',
      '2027-05-31', '2027-06-07', '2027-07-05', '2027-07-12', '2027-07-20', '2027-08-07', '2027-08-16',
      '2027-10-18', '2027-11-01', '2027-11-15', '2027-12-08', '2027-12-25',
    ]);
  });

  test('2025: antes de la Ley 2578 no existía el festivo de Chiquinquirá', () => {
    expect(festivosDelAnio(2025)).not.toContain('2025-07-14');
  });

  test('2025: San Pedro (dom 29-jun) y Sagrado Corazón (vie 27-jun) caen el mismo lunes 30 → un solo día', () => {
    const f = festivosDelAnio(2025);
    expect(f.filter((d) => d === '2025-06-30')).toHaveLength(1);
    expect(f).toHaveLength(17); // 18 festivos legales, 17 días de descanso distintos
  });

  test('los fijos no se trasladan aunque caigan en fin de semana', () => {
    expect(festivosDelAnio(2027)).toEqual(expect.arrayContaining(['2027-05-01', '2027-08-07', '2027-12-25'])); // sáb, sáb, sáb
  });

  test('un trasladable que ya cae en lunes se queda en ese lunes', () => {
    expect(festivosDelAnio(2026)).toContain('2026-06-29'); // San Pedro y San Pablo, lunes
    expect(festivosDelAnio(2026)).toContain('2026-10-12'); // Día de la Raza, lunes
  });

  test('sin duplicados aunque dos festivos caigan el mismo lunes', () => {
    for (let anio = 2000; anio <= 2060; anio++) {
      const f = festivosDelAnio(anio);
      expect(new Set(f).size).toBe(f.length);
      expect([...f].sort()).toEqual(f);
    }
  });

  test('año fuera del rango soportado → error', () => {
    expect(() => festivosDelAnio(1983)).toThrow('ANIO_NO_SOPORTADO');
    expect(() => festivosDelAnio(2201)).toThrow('ANIO_NO_SOPORTADO');
    expect(() => festivosDelAnio('2026')).toThrow('ANIO_NO_SOPORTADO');
  });
});

describe('festivosEntre', () => {
  test('incluye 16-nov-2026, 8-dic-2026 y 25-dic-2026', () => {
    expect(festivosEntre('2026-11-01', '2026-12-31')).toEqual(['2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25']);
  });

  test('rango que cruza de año e incluye los extremos', () => {
    expect(festivosEntre('2026-12-25', '2027-01-11')).toEqual(['2026-12-25', '2027-01-01', '2027-01-11']);
  });

  test('rango vacío o invertido → []', () => {
    expect(festivosEntre('2026-11-03', '2026-11-15')).toEqual([]);
    expect(festivosEntre('2026-12-31', '2026-01-01')).toEqual([]);
  });

  test('fechas mal formadas → error (no un rango silenciosamente vacío)', () => {
    expect(() => festivosEntre('2026-13-01', '2026-12-31')).toThrow('FECHA_INVALIDA');
    expect(() => festivosEntre('2026-02-30', '2026-12-31')).toThrow('FECHA_INVALIDA');
    expect(() => festivosEntre('26-11-01', '2026-12-31')).toThrow('FECHA_INVALIDA');
  });
});
