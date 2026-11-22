const { leerRango } = require('../utils/rango');

test('fechas sin hora cubren el día completo', () => {
  expect(leerRango({ desde: '2026-11-01', hasta: '2026-11-02' })).toEqual({
    desde: '2026-11-01 00:00:00', hasta: '2026-11-02 23:59:59', dias: (2 * 86400 - 1) / 86400,
  });
});

test('acepta hora con y sin segundos, con espacio o T', () => {
  const r = leerRango({ desde: '2026-11-22T08:30', hasta: '2026-11-22 14:05:30' });
  expect(r.desde).toBe('2026-11-22 08:30:00');
  expect(r.hasta).toBe('2026-11-22 14:05:30');
});

test('acepta 29 de febrero en año bisiesto', () => {
  expect(leerRango({ desde: '2024-02-29', hasta: '2024-03-01' }).desde).toBe('2024-02-29 00:00:00');
});

test.each([
  [{}, /Indica desde y hasta/],
  [{ desde: '2026-02-30', hasta: '2026-03-01' }, /Indica desde y hasta/],
  [{ desde: '2026-11-22 25:00', hasta: '2026-11-23' }, /Indica desde y hasta/],
  [{ desde: ['2026-11-01'], hasta: '2026-11-02' }, /Indica desde y hasta/],
  [{ desde: '2026-11-22', hasta: '2026-11-21' }, /anterior/],
  [{ desde: '2026-02-29', hasta: '2026-03-01' }, /Indica desde y hasta/],
  [{ desde: '2026-11-22 24:00', hasta: '2026-11-23' }, /Indica desde y hasta/],
  [{ desde: '2025-01-01', hasta: '2026-11-22' }, /366/],
])('rechaza %j con 400', (query, mensaje) => {
  try {
    leerRango(query);
    throw new Error('no lanzó');
  } catch (err) {
    expect(err.statusCode).toBe(400);
    expect(err.motivo).toBe('VALIDACION');
    expect(err.message).toMatch(mensaje);
  }
});
