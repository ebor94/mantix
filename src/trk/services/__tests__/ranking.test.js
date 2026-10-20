const { calcularRanking } = require('../ranking.service');

// Fixture: los máximos no importan aquí; solo códigos y orden de desempate (datos de la rúbrica).
const CRITERIOS = [
  { id: 1, codigo: 'CREATIVIDAD', nombre: 'Creatividad', peso_desempate: 1 },
  { id: 2, codigo: 'SEGURIDAD', nombre: 'Seguridad', peso_desempate: 2 },
  { id: 3, codigo: 'ELABORACION', nombre: 'Elaboración', peso_desempate: null },
  { id: 4, codigo: 'PASARELA', nombre: 'Pasarela', peso_desempate: null }
];
const JURADOS = [11, 12, 13];
const cal = (participante_id, jurado_id, [c, s, e, p]) => ({ participante_id, jurado_id, total: c + s + e + p, puntajes: { 1: c, 2: s, 3: e, 4: p } });
const todos = (pid, valores) => JURADOS.map((j) => cal(pid, j, valores));
const part = (id, desempate_manual = null) => ({ id, mascota_nombre: id, desempate_manual });
const ranking = (participantes, calificaciones, extra = {}) => calcularRanking({
  participantes, criterios: CRITERIOS, calificaciones, juradosActivos: JURADOS, puestosPremiados: 3, ...extra
});
const fila = (r, id) => r.filas.find((f) => f.participante_id === id);

test('R3: puntaje final = promedio de jurados (no suma), redondeado a 2 decimales', () => {
  const r = ranking([part('A')], [cal('A', 11, [30, 25, 15, 10]), cal('A', 12, [30, 25, 15, 10]), cal('A', 13, [30, 25, 15, 11])]);
  expect(fila(r, 'A').puntaje_final).toBe(80.33);
  expect(fila(r, 'A').promedios).toEqual({ CREATIVIDAD: 30, SEGURIDAD: 25, ELABORACION: 15, PASARELA: 10.33 });
});

test('§13.4 empate en total: gana más Creatividad', () => {
  const r = ranking([part('A'), part('B')], [...todos('A', [30, 20, 15, 15]), ...todos('B', [25, 25, 15, 15])]);
  expect(r.filas.map((f) => [f.participante_id, f.puesto])).toEqual([['A', 1], ['B', 2]]);
  expect(r.empates_sin_resolver).toEqual([]);
});

test('R5: empate en total y Creatividad → decide Seguridad', () => {
  const r = ranking([part('A'), part('B')], [...todos('A', [30, 20, 20, 10]), ...todos('B', [30, 25, 10, 15])]);
  expect(r.filas.map((f) => f.participante_id)).toEqual(['B', 'A']);
});

test('§13.5 empate en total, Creatividad y Seguridad → "empate sin resolver"', () => {
  const r = ranking([part('A'), part('B'), part('C')], [...todos('A', [30, 25, 15, 10]), ...todos('B', [30, 25, 10, 15]), ...todos('C', [10, 10, 10, 10])]);
  expect(fila(r, 'A')).toMatchObject({ puesto: 1, empate_sin_resolver: true });
  expect(fila(r, 'B')).toMatchObject({ puesto: 1, empate_sin_resolver: true });
  expect(fila(r, 'C')).toMatchObject({ puesto: 3, empate_sin_resolver: false });
  expect(r.empates_sin_resolver).toEqual([expect.arrayContaining(['A', 'B'])]);
});

test('desempate_manual del admin resuelve el empate', () => {
  const r = ranking([part('A', 2), part('B', 1)], [...todos('A', [30, 25, 15, 10]), ...todos('B', [30, 25, 10, 15])]);
  expect(r.filas.map((f) => [f.participante_id, f.puesto, f.empate_sin_resolver])).toEqual([['B', 1, false], ['A', 2, false]]);
  expect(r.empates_sin_resolver).toEqual([]);
});

test('§13.6 / R4: con 2 de 3 jurados queda "incompleta", fuera del podio y al final', () => {
  const r = ranking([part('A'), part('B')], [...todos('A', [10, 10, 10, 10]), cal('B', 11, [35, 30, 20, 15]), cal('B', 12, [35, 30, 20, 15])]);
  expect(fila(r, 'B')).toMatchObject({ completa: false, puesto: null, premiado: false, n_calificaciones: 2, n_jurados: 3, puntaje_final: 100 });
  expect(r.filas.map((f) => f.participante_id)).toEqual(['A', 'B']);
  expect(fila(r, 'A')).toMatchObject({ puesto: 1, premiado: true });
});

test('calificaciones de jurados inactivos no cuentan', () => {
  const r = calcularRanking({
    participantes: [part('A')], criterios: CRITERIOS, juradosActivos: [11, 12], puestosPremiados: 3,
    calificaciones: [cal('A', 11, [10, 10, 10, 10]), cal('A', 12, [20, 20, 20, 20]), cal('A', 99, [0, 0, 0, 0])]
  });
  expect(fila(r, 'A')).toMatchObject({ completa: true, puntaje_final: 60, n_calificaciones: 2 });
});

test('§13.15 empate entre 3.º y 4.º se señala; entre 4.º y 5.º no', () => {
  const ps = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => part(id));
  const r = ranking(ps, [
    ...todos('A', [35, 30, 20, 15]), ...todos('B', [34, 30, 20, 15]),
    ...todos('C', [30, 25, 15, 10]), ...todos('D', [30, 25, 10, 15]),
    ...todos('E', [20, 20, 10, 10]), ...todos('F', [20, 20, 15, 5])
  ]);
  expect(fila(r, 'C')).toMatchObject({ puesto: 3, empate_sin_resolver: true, premiado: true });
  expect(fila(r, 'D')).toMatchObject({ puesto: 3, empate_sin_resolver: true });
  expect(fila(r, 'E')).toMatchObject({ puesto: 5, empate_sin_resolver: false, premiado: false });
  expect(fila(r, 'F')).toMatchObject({ puesto: 5, empate_sin_resolver: false });
  expect(r.empates_sin_resolver).toHaveLength(1);
});

test('puestos premiados configurables (§14.3)', () => {
  const ps = ['A', 'B', 'C', 'D', 'E'].map((id) => part(id));
  const califs = ps.flatMap((p, i) => todos(p.id, [30 - i, 20, 10, 10]));
  const r = ranking(ps, califs, { puestosPremiados: 5 });
  expect(r.filas.filter((f) => f.premiado)).toHaveLength(5);
});

test('participante sin calificaciones: incompleto, sin puntaje', () => {
  const r = ranking([part('A')], []);
  expect(fila(r, 'A')).toMatchObject({ completa: false, puntaje_final: null, n_calificaciones: 0, puesto: null });
});
