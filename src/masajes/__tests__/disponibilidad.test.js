const { armarDisponibilidad, validarRango } = require('../dominio/disponibilidad');
const { crearFranjas } = require('../dominio/franjas');

const franjas = crearFranjas({ franjas: ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00'], duracionMin: 60 });
const SEMANA = { id: 1, fecha_inicio: '2026-11-23', estado: 'publicada', capacidad: 1 };
const ahora = new Date('2026-11-20T13:00:00Z'); // viernes anterior, 8:00 local
const lun9 = new Date('2026-11-23T14:00:00Z');
const base = { franjas, semanas: [SEMANA], festivos: [], bloqueos: [], citas: [], ahora, anticipacionH: 24, desde: '2026-11-23', hasta: '2026-11-27' };
const armar = (extra = {}) => armarDisponibilidad({ ...base, ...extra });
const estadoDe = (r, inicio) => r.franjas.find((f) => f.inicio === inicio.toISOString()).estado;

describe('empleado', () => {
  test('semana publicada sin citas → 30 franjas libres, ordenadas, solo { inicio, estado }', () => {
    const r = armar({ esAdmin: false });
    expect(r.franjas).toHaveLength(30);
    expect(r.franjas.every((f) => f.estado === 'libre')).toBe(true);
    expect(r.franjas[0]).toEqual({ inicio: '2026-11-23T13:00:00.000Z', estado: 'libre' });
    expect(r.franjas.map((f) => f.inicio)).toEqual([...r.franjas.map((f) => f.inicio)].sort());
    for (const f of r.franjas) expect(Object.keys(f).sort()).toEqual(['estado', 'inicio']);
  });

  test('semana en borrador o cerrada no aparece', () => {
    expect(armar({ esAdmin: false, semanas: [{ ...SEMANA, estado: 'borrador' }] }).franjas).toEqual([]);
    expect(armar({ esAdmin: false, semanas: [{ ...SEMANA, estado: 'cerrada' }] }).franjas).toEqual([]);
  });

  test('una cita activa ocupa la franja y la respuesta no revela de quién es', () => {
    const r = armar({ esAdmin: false, citas: [{ id: 9, inicio: lun9, estado: 'agendada', beneficiario_id: 5, beneficiario_nombre: 'Ana Perez' }] });
    expect(estadoDe(r, lun9)).toBe('ocupada');
    expect(JSON.stringify(r)).not.toMatch(/Ana|Perez|"id"|beneficiario|\b9\b|\b5\b/);
  });

  test('con capacidad 2, una cita deja la franja libre y dos la ocupan', () => {
    const semanas = [{ ...SEMANA, capacidad: 2 }];
    const c = (id) => ({ id, inicio: lun9, estado: 'agendada', beneficiario_id: id, beneficiario_nombre: 'X' });
    expect(estadoDe(armar({ esAdmin: false, semanas, citas: [c(1)] }), lun9)).toBe('libre');
    expect(estadoDe(armar({ esAdmin: false, semanas, citas: [c(1), c(2)] }), lun9)).toBe('ocupada');
  });

  test('bloqueo de 08:00 a 12:00 → 3 franjas bloqueadas (también si solo se solapa en parte)', () => {
    const bloqueos = [{ semana_id: 1, inicio: new Date('2026-11-23T13:00:00Z'), fin: new Date('2026-11-23T17:00:00Z') }];
    const r = armar({ esAdmin: false, bloqueos });
    expect(r.franjas.filter((f) => f.estado === 'bloqueada')).toHaveLength(3);
    const parcial = [{ semana_id: 1, inicio: new Date('2026-11-23T14:30:00Z'), fin: new Date('2026-11-23T14:45:00Z') }];
    expect(estadoDe(armar({ esAdmin: false, bloqueos: parcial }), lun9)).toBe('bloqueada');
  });

  test('un bloqueo que termina justo cuando empieza la franja no la bloquea', () => {
    const bloqueos = [{ semana_id: 1, inicio: new Date('2026-11-23T13:00:00Z'), fin: lun9 }];
    expect(estadoDe(armar({ esAdmin: false, bloqueos }), lun9)).toBe('libre');
  });

  test('los festivos no aparecen aunque no estén como bloqueo', () => {
    const r = armar({ esAdmin: false, festivos: ['2026-11-23'] });
    expect(r.franjas).toHaveLength(24);
    expect(r.franjas.some((f) => f.inicio.startsWith('2026-11-23'))).toBe(false);
  });

  test('franjas con menos de la anticipación → pasada, aunque estén ocupadas o libres', () => {
    const ahoraLun = new Date('2026-11-23T13:00:00Z'); // lun 8:00
    const r = armar({ esAdmin: false, ahora: ahoraLun, citas: [{ id: 1, inicio: new Date('2026-11-24T13:00:00Z'), estado: 'agendada', beneficiario_id: 1, beneficiario_nombre: 'X' }] });
    expect(estadoDe(r, new Date('2026-11-23T21:00:00Z'))).toBe('pasada'); // lun 16:00
    expect(estadoDe(r, new Date('2026-11-24T13:00:00Z'))).toBe('ocupada'); // mar 8:00: justo 24 h, ocupada
    expect(estadoDe(r, new Date('2026-11-24T14:00:00Z'))).toBe('libre');
  });

  test('el bloqueo gana sobre todo lo demás', () => {
    const bloqueos = [{ semana_id: 1, inicio: lun9, fin: new Date('2026-11-23T15:00:00Z') }];
    const citas = [{ id: 1, inicio: lun9, estado: 'agendada', beneficiario_id: 1, beneficiario_nombre: 'X' }];
    expect(estadoDe(armar({ esAdmin: false, bloqueos, citas, ahora: new Date('2026-11-25T13:00:00Z') }), lun9)).toBe('bloqueada');
  });

  test('solo las franjas dentro del rango pedido', () => {
    const r = armar({ esAdmin: false, desde: '2026-11-24', hasta: '2026-11-25' });
    expect(r.franjas).toHaveLength(12);
    expect(r.franjas.every((f) => f.inicio >= '2026-11-24T05:00:00.000Z' && f.inicio < '2026-11-26T05:00:00.000Z')).toBe(true);
  });

  test('un bloqueo o una cita de OTRA semana no afecta esta', () => {
    const otra = { ...SEMANA, id: 2, fecha_inicio: '2026-11-30' };
    const bloqueos = [{ semana_id: 2, inicio: lun9, fin: new Date('2026-11-23T15:00:00Z') }];
    expect(estadoDe(armar({ esAdmin: false, semanas: [SEMANA, otra], bloqueos }), lun9)).toBe('libre');
  });
});

describe('admin', () => {
  test('ve semanas en borrador y cerradas, con el estado de la semana y la capacidad', () => {
    const r = armar({ esAdmin: true, semanas: [{ ...SEMANA, estado: 'borrador' }] });
    expect(r.franjas).toHaveLength(30);
    expect(r.franjas[0]).toMatchObject({ semana: { id: 1, estado: 'borrador' }, capacidad: 1, citas: [] });
  });

  test('ve de quién es cada cita', () => {
    const r = armar({ esAdmin: true, citas: [{ id: 9, inicio: lun9, estado: 'agendada', beneficiario_id: 5, beneficiario_nombre: 'Ana Perez' }] });
    const f = r.franjas.find((x) => x.inicio === lun9.toISOString());
    expect(f).toMatchObject({ estado: 'ocupada', citas: [{ id: 9, estado: 'agendada', beneficiario: { id: 5, nombre: 'Ana Perez' } }] });
  });

  test('para el admin "pasada" es solo lo que ya empezó (no aplica la anticipación)', () => {
    const ahoraLun = new Date('2026-11-23T13:30:00Z'); // lun 8:30
    const r = armar({ esAdmin: true, ahora: ahoraLun });
    expect(estadoDe(r, new Date('2026-11-23T13:00:00Z'))).toBe('pasada'); // 8:00 ya empezó
    expect(estadoDe(r, lun9)).toBe('libre'); // 9:00 aún no
  });
});

describe('validarRango', () => {
  test('acepta hasta 31 días inclusive', () => {
    expect(validarRango('2026-11-01', '2026-12-01')).toEqual({ desde: '2026-11-01', hasta: '2026-12-01' });
    expect(validarRango('2026-11-23', '2026-11-23')).toEqual({ desde: '2026-11-23', hasta: '2026-11-23' });
  });

  test.each([
    ['2026-11-01', '2026-12-02', 'RANGO_MUY_LARGO'],
    ['2026-11-27', '2026-11-23', 'RANGO_INVERTIDO'],
    ['2026-02-30', '2026-03-01', 'FECHA_INVALIDA'],
    ['23/11/2026', '2026-11-27', 'FECHA_INVALIDA'],
    [undefined, '2026-11-27', 'FECHA_INVALIDA'],
    [['2026-11-23'], '2026-11-27', 'FECHA_INVALIDA'], // ?desde=a&desde=b llega como arreglo
  ])('%p..%p → VALIDACION %s', (desde, hasta, motivo) => {
    let e;
    try { validarRango(desde, hasta); } catch (err) { e = err; }
    expect(e).toMatchObject({ motivo: 'VALIDACION', errors: [{ campo: 'rango', motivo }] });
  });
});
