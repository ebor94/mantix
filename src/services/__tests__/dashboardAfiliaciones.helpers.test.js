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
