const {
  resolverScope, normalizarRango, elegirGranularidad, construirWhere
} = require('../dashboardAfiliaciones.helpers');
const { Op } = require('sequelize');

describe('resolverScope', () => {
  test('super_admin es global', () => {
    expect(resolverScope({ id: 5, es_super_admin: true })).toEqual({ esGlobal: true, asesorId: null });
  });
  test('rol con ver_todas es global', () => {
    const u = { id: 5, es_super_admin: false, rol: { permisos: { afiliaciones: { ver_todas: true } } } };
    expect(resolverScope(u)).toEqual({ esGlobal: true, asesorId: null });
  });
  test('asesor sin ver_todas queda scoped a su id', () => {
    const u = { id: 7, es_super_admin: false, rol: { permisos: { afiliaciones: { ver_propias: true } } } };
    expect(resolverScope(u)).toEqual({ esGlobal: false, asesorId: 7 });
  });
  test('permisos como string JSON', () => {
    const u = { id: 9, rol: { permisos: JSON.stringify({ afiliaciones: { ver_todas: true } }) } };
    expect(resolverScope(u)).toEqual({ esGlobal: true, asesorId: null });
  });
});

describe('normalizarRango', () => {
  test('sin fechas usa el mes actual', () => {
    const hoy = new Date('2026-09-18T10:00:00');
    expect(normalizarRango(undefined, undefined, hoy)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });
  test('respeta fechas dadas', () => {
    expect(normalizarRango('2026-01-05', '2026-01-20')).toEqual({ desde: '2026-01-05', hasta: '2026-01-20' });
  });
  test('corrige orden invertido', () => {
    expect(normalizarRango('2026-01-20', '2026-01-05')).toEqual({ desde: '2026-01-05', hasta: '2026-01-20' });
  });
  test('lanza si el rango supera 366 días', () => {
    expect(() => normalizarRango('2024-01-01', '2026-01-01')).toThrow(/rango/i);
  });
});

describe('elegirGranularidad', () => {
  test('rango corto -> dia', () => {
    expect(elegirGranularidad('2026-09-01', '2026-09-30')).toBe('dia');
  });
  test('rango largo -> mes', () => {
    expect(elegirGranularidad('2026-01-01', '2026-06-30')).toBe('mes');
  });
});

describe('construirWhere', () => {
  const rango = { desde: '2026-09-01', hasta: '2026-09-30' };
  test('no-global fuerza asesorId e ignora origen', () => {
    const w = construirWhere({ rango, scope: { esGlobal: false, asesorId: 7 }, origen: 'VEOLIA', convenioId: 3 });
    expect(w.asesorId).toBe(7);
    expect(w.origen).toBeUndefined();
    expect(w.convenioId).toBeUndefined();
    expect(w.createdAt[Op.between]).toHaveLength(2);
  });
  test('global con origen CONVENIO + convenioId', () => {
    const w = construirWhere({ rango, scope: { esGlobal: true, asesorId: null }, origen: 'CONVENIO', convenioId: '3' });
    expect(w.origen).toBe('CONVENIO');
    expect(w.convenioId).toBe(3);
    expect(w.asesorId).toBeUndefined();
  });
  test('global sin origen no filtra por origen', () => {
    const w = construirWhere({ rango, scope: { esGlobal: true, asesorId: null } });
    expect(w.origen).toBeUndefined();
  });
});

const {
  ensamblarKpis, ensamblarPorOrigen, ensamblarRanking
} = require('../dashboardAfiliaciones.helpers');

describe('ensamblarKpis', () => {
  test('calcula tasa de aprobación', () => {
    const k = ensamblarKpis({ registradas: '10', aprobadas: '8', pendientes: '1', rechazadas: '1', anuladas: '0' });
    expect(k).toEqual({ registradas: 10, aprobadas: 8, pendientes: 1, rechazadas: 1, anuladas: 0, tasaAprobacion: 0.8 });
  });
  test('registradas 0 -> tasa 0 (sin división por cero)', () => {
    const k = ensamblarKpis({ registradas: '0', aprobadas: '0', pendientes: '0', rechazadas: '0', anuladas: '0' });
    expect(k.tasaAprobacion).toBe(0);
  });
  test('row null (sin filas) -> todo en 0', () => {
    expect(ensamblarKpis(null).registradas).toBe(0);
  });
});

describe('ensamblarPorOrigen', () => {
  test('etiqueta y ordena por registradas desc', () => {
    const rows = [
      { origen: 'ASESOR', convenioId: null, registradas: '5', aprobadas: '4' },
      { origen: 'VEOLIA', convenioId: null, registradas: '9', aprobadas: '7' },
      { origen: 'CONVENIO', convenioId: 3, registradas: '2', aprobadas: '1' }
    ];
    const out = ensamblarPorOrigen(rows, { 3: 'Conyca' });
    expect(out.map(o => o.label)).toEqual(['Veolia', 'Asesor', 'Conyca']);
    expect(out[0]).toEqual({ origen: 'VEOLIA', convenioId: null, label: 'Veolia', registradas: 9, aprobadas: 7 });
  });
  test('convenio sin nombre cae a "Convenio"', () => {
    const out = ensamblarPorOrigen([{ origen: 'CONVENIO', convenioId: 99, registradas: '1', aprobadas: '0' }], {});
    expect(out[0].label).toBe('Convenio');
  });
});

describe('ensamblarRanking', () => {
  test('ordena desc, calcula tasa y corta a topN', () => {
    const rows = [
      { asesorId: 1, registradas: '3', aprobadas: '3' },
      { asesorId: 2, registradas: '10', aprobadas: '5' },
      { asesorId: 3, registradas: '7', aprobadas: '7' }
    ];
    const out = ensamblarRanking(rows, { 1: 'Ana', 2: 'Beto', 3: 'Cira' }, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ asesorId: 2, nombre: 'Beto', registradas: 10, aprobadas: 5, tasaAprobacion: 0.5 });
    expect(out[1].nombre).toBe('Cira');
  });
  test('asesor sin nombre cae a "Asesor <id>"', () => {
    const out = ensamblarRanking([{ asesorId: 42, registradas: '1', aprobadas: '1' }], {}, 15);
    expect(out[0].nombre).toBe('Asesor 42');
  });
});
