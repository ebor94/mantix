// Quién puede registrar el F-05 (encuentro con la familia) y llevar el caso a
// velación.
//
// Son cuatro tablas distintas y hay que moverlas juntas: la etapa, el estado,
// lo que el estado exige para cerrarse y la transición. Abrir la etapa sin la
// transición es el error silencioso de este módulo — la persona llena el
// formato, lo cierra, y el caso se queda en ENCUENTRO sin pasar a SALA.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const {
  ESTADOS_POR_ROL, ETAPAS_POR_ROL, ETAPAS_PARA_CERRAR, TRANSICIONES,
} = require('../asistencias.controller');

const ROL = 'asistente_tanatologo';

describe('el asistente de tanatólogo puede hacer el F-05', () => {
  test('puede guardar la etapa', () => {
    expect(ETAPAS_POR_ROL[ROL]).toContain('F05_ENTREGA');
  });

  test('puede trabajar en el estado ENCUENTRO', () => {
    expect(ESTADOS_POR_ROL[ROL]).toContain('ENCUENTRO');
  });

  test('ENCUENTRO le exige el F-05 para cerrarse', () => {
    expect(ETAPAS_PARA_CERRAR[ROL].ENCUENTRO).toEqual(['F05_ENTREGA']);
  });

  // La que de verdad importa: sin esto cierra el formato y el caso no avanza.
  test('puede ejecutar la transición a velación', () => {
    expect(TRANSICIONES.ENCUENTRO.roles).toContain(ROL);
  });

  // Las cuatro tienen que estar de acuerdo. Esta prueba es la que falla si
  // alguien mueve una sola.
  test.each(['ASISTENCIA', 'PRESERVACION', 'ENCOFRADO', 'ENCUENTRO'])(
    'en %s el rol tiene estado, requisitos y transición coherentes', (estado) => {
      expect(ESTADOS_POR_ROL[ROL]).toContain(estado);
      expect(ETAPAS_PARA_CERRAR[ROL][estado]).toBeDefined();
      expect(TRANSICIONES[estado].roles).toContain(ROL);
    });
});

describe('lo que el permiso NO abrió', () => {
  // El F-05 lleva el caso hasta SALA. Sacarlo de ahí hacia aprobación sigue
  // siendo de supervisión: es el cierre de la velación, no el encuentro.
  test('no puede sacar el caso de SALA hacia APROBACION', () => {
    expect(TRANSICIONES.SALA.roles).not.toContain(ROL);
    expect(ETAPAS_PARA_CERRAR[ROL].SALA).toBeUndefined();
  });

  test('no puede aprobar ni cerrar', () => {
    expect(TRANSICIONES.APROBACION.roles).not.toContain(ROL);
  });

  // Despachar un caso nuevo es de quien lo vende y de coordinación.
  test('no puede despachar un caso nuevo', () => {
    expect(TRANSICIONES.NUEVO.roles).not.toContain(ROL);
  });
});

describe('a los demás roles no se les movió nada', () => {
  test.each(['asistente', 'tanatologo'])('%s sigue sin poder guardar el F-05', (rol) => {
    expect(ETAPAS_POR_ROL[rol]).not.toContain('F05_ENTREGA');
  });

  test.each(['asistente', 'tanatologo'])('%s sigue sin trabajar en ENCUENTRO', (rol) => {
    expect(ESTADOS_POR_ROL[rol] || []).not.toContain('ENCUENTRO');
  });

  // Quienes ya lo hacían lo siguen haciendo: el permiso se suma, no se mueve.
  test.each(['supervisora', 'asesor', 'admin'])('%s conserva el F-05', (rol) => {
    expect(ETAPAS_POR_ROL[rol]).toContain('F05_ENTREGA');
    expect(ETAPAS_PARA_CERRAR[rol].ENCUENTRO).toEqual(['F05_ENTREGA']);
  });

  test.each(['asesor', 'supervisora', 'coordinador', 'admin'])(
    '%s conserva la transición a velación', (rol) => {
      expect(TRANSICIONES.ENCUENTRO.roles).toContain(rol);
    });
});

// Lo que el estado exige para cerrarse es una regla del proceso, no un
// permiso: todos los roles que declaran ENCUENTRO tienen que pedir lo mismo,
// porque el controlador los colapsa en una sola tabla (REQUISITOS_CIERRE).
describe('los requisitos del encuentro no dependen del rol', () => {
  test('todo rol que cierra ENCUENTRO exige exactamente el F-05', () => {
    const declaran = Object.entries(ETAPAS_PARA_CERRAR)
      .filter(([, porEstado]) => porEstado.ENCUENTRO !== undefined);

    expect(declaran.length).toBeGreaterThan(1);
    for (const [rol, porEstado] of declaran) {
      expect(porEstado.ENCUENTRO).toEqual(['F05_ENTREGA']);
      expect(rol).toBeTruthy();
    }
  });
});
