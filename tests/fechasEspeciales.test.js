/** "Hoy" es el día de Colombia, no el de UTC. */
const { proximaOcurrencia } = require('../src/sv/utils/fechasEspeciales');

afterEach(() => jest.useRealTimers());
const reloj = (iso) => jest.useFakeTimers().setSystemTime(new Date(iso));

describe('proximaOcurrencia a las 8:30 p. m. del 25 de noviembre en Colombia', () => {
  beforeEach(() => reloj('2026-11-26T01:30:00Z'));
  test('cumpleaños del 25: hoy', () => {
    expect(proximaOcurrencia('1990-11-25')).toMatchObject({ diasRestantes: 0, anio: 2026, proxima: '2026-11-25' });
  });
  test('cumpleaños del 26: mañana', () => {
    expect(proximaOcurrencia('1990-11-26').diasRestantes).toBe(1);
  });
  test('cumpleaños del 24: el año siguiente', () => {
    expect(proximaOcurrencia('1990-11-24')).toMatchObject({ diasRestantes: 364, anio: 2027 });
  });
});

test('31 de diciembre en Colombia (UTC ya es 2027)', () => {
  reloj('2027-01-01T01:30:00Z');
  expect(proximaOcurrencia('1990-12-31')).toMatchObject({ diasRestantes: 0, anio: 2026 });
});
