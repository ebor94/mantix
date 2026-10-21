const { QUESTIONS } = require('../shared/survey.config.cjs');
const { totales, distribucion, nps, matrizP2P3, ultimasFrases } = require('../services/stats');

const base = {
  p1: 'A', p2: 'ambas', p3: 'memoria', p3_otro: null, p4: 'diversidad', p4_otro: null,
  p5: 'B', p6: 8, p7: 'Una frase de prueba larga.', origen: null, duracion_seg: 30,
  created_at: new Date('2026-10-17T15:00:00.000Z'),
};
const fila = (extra = {}) => ({ ...base, ...extra });
const conP6 = (...valores) => valores.map((p6) => fila({ p6 }));
const codigos = (id) => QUESTIONS.find((q) => q.id === id).options.map((o) => o.code);

describe('totales', () => {
  it('cuenta las respuestas', () => {
    expect(totales([fila(), fila(), fila()])).toBe(3);
    expect(totales([])).toBe(0);
  });
});

describe('distribucion', () => {
  it('incluye todos los códigos de P1-P5 (también con 0), en el orden de QUESTIONS y con el label literal', () => {
    const d = distribucion([fila({ p1: 'B' }), fila({ p1: 'B' }), fila({ p1: 'D' })]);
    for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
      expect(d[id].map((o) => o.codigo)).toEqual(codigos(id));
    }
    expect(d.p1).toEqual([
      { codigo: 'A', label: 'No sabía que en Los Olivos habitaban diferentes especies de aves y otros animales.', total: 0 },
      { codigo: 'B', label: 'Sabía que había aves y otros animales, pero desconocía la diversidad de especies.', total: 2 },
      { codigo: 'C', label: 'Sabía que Los Olivos tenía una importante diversidad de aves y conocía algunos ejemplos.', total: 0 },
      { codigo: 'D', label: 'Ya conocía los registros científicos de biodiversidad de Los Olivos.', total: 1 },
    ]);
    expect(d.p3.find((o) => o.codigo === 'otro')).toEqual({ codigo: 'otro', label: 'Otro', total: 0 });
  });

  it('P6 cuenta por valor 1-10 incluyendo ceros', () => {
    const d = distribucion(conP6(10, 10, 1, 7));
    expect(d.p6.map((x) => x.valor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d.p6.map((x) => x.total)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 2]);
  });

  it('sin filas todo es 0', () => {
    const d = distribucion([]);
    expect(d.p2.every((o) => o.total === 0)).toBe(true);
    expect(d.p6).toHaveLength(10);
  });

  it('ignora códigos desconocidos sin romper', () => {
    const d = distribucion([fila({ p2: 'raro' })]);
    expect(d.p2.reduce((s, o) => s + o.total, 0)).toBe(0);
  });
});

describe('nps', () => {
  it('caso obligatorio: 5 promotores, 3 pasivos, 2 detractores → NPS 30', () => {
    const r = nps(conP6(9, 9, 10, 10, 9, 7, 8, 7, 6, 1));
    expect(r).toEqual({
      total: 10,
      promotores: 5, pasivos: 3, detractores: 2,
      pctPromotores: 50, pctPasivos: 30, pctDetractores: 20,
      nps: 30,
    });
  });

  it('límites de grupos: 9-10 promotores, 7-8 pasivos, 1-6 detractores', () => {
    const r = nps(conP6(1, 6, 7, 8, 9, 10));
    expect([r.detractores, r.pasivos, r.promotores]).toEqual([2, 2, 2]);
  });

  it('porcentajes a 1 decimal y NPS entero calculado con valores sin redondear', () => {
    // 1 promotor, 1 pasivo, 1 detractor → 33.3 / 33.3 / 33.3; NPS 0
    const r = nps(conP6(10, 8, 3));
    expect(r.pctPromotores).toBe(33.3);
    expect(r.pctPasivos).toBe(33.3);
    expect(r.pctDetractores).toBe(33.3);
    expect(r.nps).toBe(0);
    // 2 promotores y 1 detractor de 3: 66.67 - 33.33 = 33.33 → 33
    expect(nps(conP6(9, 10, 2)).nps).toBe(33);
    // 1 promotor, 2 detractores, 5 pasivos de 8: 12.5 - 25 = -12.5 → Math.round → -12
    expect(nps(conP6(9, 3, 4, 7, 7, 7, 8, 8)).nps).toBe(-12);
  });

  it('sin respuestas: nps null y sin división por cero', () => {
    expect(nps([])).toEqual({
      total: 0, promotores: 0, pasivos: 0, detractores: 0,
      pctPromotores: null, pctPasivos: null, pctDetractores: null, nps: null,
    });
  });
});

describe('matrizP2P3', () => {
  it('trae todas las combinaciones P2 x P3 (también las de 0) con etiquetas', () => {
    const m = matrizP2P3([
      fila({ p2: 'cementerio', p3: 'parque_vida' }),
      fila({ p2: 'cementerio', p3: 'parque_vida' }),
      fila({ p2: 'ambas', p3: 'otro' }),
    ]);
    expect(m).toHaveLength(codigos('p2').length * codigos('p3').length);
    expect(m[0]).toEqual({
      p2: 'cementerio', p2Label: 'Un parque cementerio.',
      p3: 'memoria', p3Label: 'Un lugar de memoria y homenaje.', total: 0,
    });
    const celda = (a, b) => m.find((c) => c.p2 === a && c.p3 === b);
    expect(celda('cementerio', 'parque_vida')).toMatchObject({ p3Label: 'Un Parque de Vida con biodiversidad.', total: 2 });
    expect(celda('ambas', 'otro').total).toBe(1);
    expect(celda('no_conocia', 'sin_cambio').total).toBe(0);
    expect(m.reduce((s, c) => s + c.total, 0)).toBe(3);
  });
});

describe('ultimasFrases', () => {
  const frase = (n, min) => fila({
    p7: `Frase número ${n}`,
    created_at: new Date(Date.UTC(2026, 9, 17, 12, min)),
    ip_hash: 'x'.repeat(64), ua_hash: 'y'.repeat(64), uuid: 'u',
  });

  it('devuelve las últimas 20, más recientes primero, solo texto y fecha ISO', () => {
    const filas = Array.from({ length: 25 }, (_, i) => frase(i, i)); // orden ascendente por fecha
    const r = ultimasFrases(filas, 20);
    expect(r).toHaveLength(20);
    expect(r[0]).toEqual({ texto: 'Frase número 24', fecha: '2026-10-17T12:24:00.000Z' });
    expect(r[19].texto).toBe('Frase número 5');
    expect(Object.keys(r[0]).sort()).toEqual(['fecha', 'texto']);
  });

  it('ordena por created_at aunque las filas lleguen desordenadas y acepta fechas en texto', () => {
    const r = ultimasFrases([
      fila({ p7: 'vieja', created_at: '2026-10-17T10:00:00.000Z' }),
      fila({ p7: 'nueva', created_at: new Date('2026-10-17T11:00:00.000Z') }),
    ]);
    expect(r.map((x) => x.texto)).toEqual(['nueva', 'vieja']);
    expect(r[1].fecha).toBe('2026-10-17T10:00:00.000Z');
  });

  it('por defecto usa 20 y no falla sin filas', () => {
    expect(ultimasFrases([])).toEqual([]);
    expect(ultimasFrases(Array.from({ length: 30 }, (_, i) => frase(i, i)))).toHaveLength(20);
  });
});
