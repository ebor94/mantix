const { crearReglas, estadoConsumeCupo, puedeTransicionar } = require('../dominio/reglas');

const reglas = crearReglas({ anticipacionAgendarH: 24, anticipacionModificarH: 24 });
const { puedeAgendar, puedeModificar, puedeMarcarAsistencia } = reglas;
const ahora = new Date('2026-11-23T13:00:00Z'); // lun 8:00 local
const H = 3600000;

describe('puedeAgendar', () => {
  test('empleado: exactamente 24 h antes sí; un minuto menos no', () => {
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + 24 * H), esAdmin: false })).toBe(true);
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + 24 * H - 60000), esAdmin: false })).toBe(false);
  });

  test('admin ignora la anticipación pero no el pasado ni el instante actual', () => {
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + H), esAdmin: true })).toBe(true);
    expect(puedeAgendar({ ahora, inicio: ahora, esAdmin: true })).toBe(false);
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() - H), esAdmin: true })).toBe(false);
  });

  test('esAdmin solo cuenta si es exactamente true (un "true" de texto no da privilegios)', () => {
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + H), esAdmin: 'true' })).toBe(false);
    expect(puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + H), esAdmin: 1 })).toBe(false);
  });

  test('fechas inválidas o que no son Date → false (falla cerrada)', () => {
    expect(puedeAgendar({ ahora, inicio: new Date('x'), esAdmin: true })).toBe(false);
    expect(puedeAgendar({ ahora: new Date('x'), inicio: new Date(ahora.getTime() + 48 * H), esAdmin: false })).toBe(false);
    expect(puedeAgendar({ ahora, inicio: '2026-11-30T13:00:00Z', esAdmin: false })).toBe(false);
    expect(puedeAgendar({ inicio: new Date(ahora.getTime() + 48 * H), esAdmin: false })).toBe(false); // sin ahora
  });

  test('respeta la anticipación configurada', () => {
    const r2 = crearReglas({ anticipacionAgendarH: 2, anticipacionModificarH: 24 });
    expect(r2.puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + 2 * H), esAdmin: false })).toBe(true);
    expect(r2.puedeAgendar({ ahora, inicio: new Date(ahora.getTime() + H), esAdmin: false })).toBe(false);
  });

  test('con anticipación 0 el empleado sigue sin poder agendar en el pasado', () => {
    const r0 = crearReglas({ anticipacionAgendarH: 0, anticipacionModificarH: 0 });
    expect(r0.puedeAgendar({ ahora, inicio: ahora, esAdmin: false })).toBe(false);
    expect(r0.puedeAgendar({ ahora, inicio: new Date(ahora.getTime() - 60000), esAdmin: false })).toBe(false);
  });
});

describe('puedeModificar', () => {
  const cita = { estado: 'agendada', inicio: new Date(ahora.getTime() + 25 * H) };

  test('empleado: solo agendada y con 24 h', () => {
    expect(puedeModificar({ ahora, cita, esAdmin: false })).toBe(true);
    expect(puedeModificar({ ahora, cita: { ...cita, inicio: new Date(ahora.getTime() + 23 * H) }, esAdmin: false })).toBe(false);
  });

  test('admin sin anticipación, pero no después de empezar', () => {
    expect(puedeModificar({ ahora, cita: { ...cita, inicio: new Date(ahora.getTime() + H) }, esAdmin: true })).toBe(true);
    expect(puedeModificar({ ahora, cita: { ...cita, inicio: ahora }, esAdmin: true })).toBe(false);
  });

  test.each(['cancelada', 'asistio', 'no_asistio', 'otro', undefined])('estado %s → nadie la modifica', (estado) => {
    expect(puedeModificar({ ahora, cita: { ...cita, estado }, esAdmin: true })).toBe(false);
    expect(puedeModificar({ ahora, cita: { ...cita, estado }, esAdmin: false })).toBe(false);
  });

  test('sin cita o con inicio inválido → false', () => {
    expect(puedeModificar({ ahora, cita: null, esAdmin: true })).toBe(false);
    expect(puedeModificar({ ahora, cita: { estado: 'agendada', inicio: new Date('x') }, esAdmin: true })).toBe(false);
  });

  test('la anticipación para modificar es independiente de la de agendar', () => {
    const r = crearReglas({ anticipacionAgendarH: 2, anticipacionModificarH: 48 });
    expect(r.puedeModificar({ ahora, cita, esAdmin: false })).toBe(false); // faltan 25 h < 48 h
  });
});

describe('puedeMarcarAsistencia', () => {
  test('solo citas agendadas que ya empezaron', () => {
    expect(puedeMarcarAsistencia({ ahora, cita: { estado: 'agendada', inicio: new Date(ahora.getTime() - H) } })).toBe(true);
    expect(puedeMarcarAsistencia({ ahora, cita: { estado: 'agendada', inicio: ahora } })).toBe(true);
    expect(puedeMarcarAsistencia({ ahora, cita: { estado: 'agendada', inicio: new Date(ahora.getTime() + H) } })).toBe(false);
    expect(puedeMarcarAsistencia({ ahora, cita: { estado: 'cancelada', inicio: new Date(ahora.getTime() - H) } })).toBe(false);
    expect(puedeMarcarAsistencia({ ahora, cita: { estado: 'asistio', inicio: new Date(ahora.getTime() - H) } })).toBe(false);
  });
});

describe('estados', () => {
  test('consumen cupo: agendada, asistio y no_asistio; cancelada lo libera', () => {
    expect(['agendada', 'asistio', 'no_asistio'].every(estadoConsumeCupo)).toBe(true);
    expect(estadoConsumeCupo('cancelada')).toBe(false);
    expect(estadoConsumeCupo('desconocido')).toBe(false);
  });

  test('transiciones válidas (spec §17.4)', () => {
    for (const hacia of ['cancelada', 'asistio', 'no_asistio']) expect(puedeTransicionar('agendada', hacia)).toBe(true);
    expect(puedeTransicionar('agendada', 'agendada')).toBe(false);
    for (const desde of ['cancelada', 'asistio', 'no_asistio']) {
      for (const hacia of ['agendada', 'cancelada', 'asistio', 'no_asistio']) expect(puedeTransicionar(desde, hacia)).toBe(false);
    }
    expect(puedeTransicionar('agendada', 'borrada')).toBe(false);
  });
});

test('crearReglas rechaza configuración inválida (no deja NaN silencioso)', () => {
  expect(() => crearReglas({ anticipacionAgendarH: NaN, anticipacionModificarH: 24 })).toThrow('CONFIG_REGLAS');
  expect(() => crearReglas({ anticipacionAgendarH: 24 })).toThrow('CONFIG_REGLAS');
  expect(() => crearReglas({ anticipacionAgendarH: -1, anticipacionModificarH: 24 })).toThrow('CONFIG_REGLAS');
});
