const { crearFranjas } = require('../dominio/franjas');

const FRANJAS = ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00'];
const { franjasDeSemana, slotKey, periodoDe, esFranjaValida, lunesDe } = crearFranjas({ franjas: FRANJAS, duracionMin: 60 });

describe('franjasDeSemana', () => {
  test('genera 30 franjas L-V para una semana sin festivos', () => {
    const f = franjasDeSemana('2026-11-23', { festivos: [] });
    expect(f).toHaveLength(30);
    expect(f[0].inicioLocal).toBe('2026-11-23T08:00');
    expect(f[29].inicioLocal).toBe('2026-11-27T16:00');
  });

  test('excluye festivos', () => {
    const f = franjasDeSemana('2026-11-16', { festivos: ['2026-11-16'] });
    expect(f).toHaveLength(24);
    expect(f.some((x) => x.inicioLocal.startsWith('2026-11-16'))).toBe(false);
  });

  test('rechaza fecha_inicio que no es lunes o no es fecha', () => {
    expect(() => franjasDeSemana('2026-11-24', { festivos: [] })).toThrow('LUNES_REQUERIDO');
    expect(() => franjasDeSemana('no-es-fecha', { festivos: [] })).toThrow('LUNES_REQUERIDO');
  });

  test('instante absoluto correcto (Bogotá = UTC-5) y fin según la duración', () => {
    const [p] = franjasDeSemana('2026-11-23', { festivos: [] });
    expect(p.inicio.toISOString()).toBe('2026-11-23T13:00:00.000Z');
    expect(p.fin.toISOString()).toBe('2026-11-23T14:00:00.000Z');
  });

  test('no depende de la zona horaria del proceso', () => {
    // El servidor puede correr en UTC o en otra zona: el resultado debe ser el mismo instante.
    // (La verificación del módulo corre esta suite con TZ=UTC, America/Bogota y Asia/Tokyo.)
    const f = franjasDeSemana('2026-11-23', { festivos: [] });
    expect(f.map((x) => x.inicio.getUTCHours()).slice(0, 6)).toEqual([13, 14, 15, 19, 20, 21]);
  });

  test('respeta la configuración inyectada', () => {
    const otra = crearFranjas({ franjas: ['09:00'], duracionMin: 45 });
    const f = otra.franjasDeSemana('2026-11-23', { festivos: [] });
    expect(f).toHaveLength(5);
    expect(f[0].fin.toISOString()).toBe('2026-11-23T14:45:00.000Z');
  });
});

describe('slotKey y periodo usan hora local', () => {
  test('una cita del 30-nov a las 23:30 local pertenece a noviembre', () => {
    expect(periodoDe(new Date('2026-12-01T04:30:00Z'))).toBe('2026-11');
  });

  test('slotKey', () => {
    expect(slotKey(new Date('2026-11-23T13:00:00Z'), 1)).toBe('2026-11-23T08:00#1');
    expect(slotKey(new Date('2026-11-23T13:00:00Z'), 2)).toBe('2026-11-23T08:00#2');
  });

  test('slotKey cabe en la columna VARCHAR(40)', () => {
    expect(slotKey(new Date('2026-11-23T13:00:00Z'), 20).length).toBeLessThanOrEqual(40);
  });
});

describe('esFranjaValida', () => {
  test('solo inicios configurados en día hábil', () => {
    expect(esFranjaValida(new Date('2026-11-23T13:00:00Z'))).toBe(true); // lun 8:00
    expect(esFranjaValida(new Date('2026-11-27T21:00:00Z'))).toBe(true); // vie 16:00
    expect(esFranjaValida(new Date('2026-11-23T16:00:00Z'))).toBe(false); // lun 11:00
    expect(esFranjaValida(new Date('2026-11-28T13:00:00Z'))).toBe(false); // sábado
    expect(esFranjaValida(new Date('2026-11-29T13:00:00Z'))).toBe(false); // domingo
  });

  test('rechaza segundos, milisegundos, fechas inválidas y tipos que no son Date', () => {
    expect(esFranjaValida(new Date('2026-11-23T13:00:01Z'))).toBe(false);
    expect(esFranjaValida(new Date('2026-11-23T13:00:00.500Z'))).toBe(false);
    expect(esFranjaValida(new Date('no-es-fecha'))).toBe(false);
    expect(esFranjaValida('2026-11-23T13:00:00Z')).toBe(false);
    expect(esFranjaValida(1795438800000)).toBe(false);
    expect(esFranjaValida(null)).toBe(false);
  });
});

describe('lunesDe', () => {
  test.each([
    ['2026-11-23T13:00:00Z', '2026-11-23'], // lunes
    ['2026-11-27T21:00:00Z', '2026-11-23'], // viernes
    ['2026-11-30T04:30:00Z', '2026-11-23'], // domingo 23:30 local
    ['2026-11-30T05:00:00Z', '2026-11-30'], // lunes 00:00 local
  ])('%s → %s', (instante, lunes) => expect(lunesDe(new Date(instante))).toBe(lunes));
});
