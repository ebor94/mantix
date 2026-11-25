/** "Hoy" es el día de Colombia (UTC-5), no el de UTC: después de las 7 p. m. UTC ya es mañana. */
const { aISO, hoyISO, hoyBogotaISO, diaBogotaISO, rangoDia, rango } = require('../src/sv/utils/fechas');

afterEach(() => jest.useRealTimers());

describe.each([
  ['8:30 p. m. del 25 en Colombia', '2026-11-26T01:30:00Z'],
  ['10:00 a. m. del 25 en Colombia', '2026-11-25T15:00:00Z']
])('con el reloj a las %s', (_n, ahora) => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(ahora)));

  test('hoyISO y hoyBogotaISO dan el 25', () => {
    expect(hoyISO()).toBe('2026-11-25');
    expect(hoyBogotaISO()).toBe('2026-11-25');
  });
  test('rangoDia() sin argumento es el 25', () => {
    expect(rangoDia().fecha).toBe('2026-11-25');
  });
  test('rango() sin argumentos es el 25', () => {
    const r = rango();
    expect(r.desde).toBe('2026-11-25');
    expect(r.hasta).toBe('2026-11-25');
  });
});

describe('diaBogotaISO', () => {
  test('de un Date', () => {
    expect(diaBogotaISO(new Date('2026-11-26T01:30:00Z'))).toBe('2026-11-25');
    expect(diaBogotaISO(new Date('2026-11-26T05:00:00Z'))).toBe('2026-11-26');
  });
  test('de un texto con zona', () => {
    expect(diaBogotaISO('2026-11-26T01:30:00Z')).toBe('2026-11-25');
    expect(diaBogotaISO('2026-11-25T22:00:00-05:00')).toBe('2026-11-25');
  });
});

describe('aISO no cambia', () => {
  test('usa el día UTC de un Date y corta los textos', () => {
    expect(aISO(new Date('2026-11-28T00:00:00Z'))).toBe('2026-11-28');
    expect(aISO('2026-11-28T10:00')).toBe('2026-11-28');
  });
});
