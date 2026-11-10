// Qué pasa con las columnas de inactivación cuando se mueve `activo` desde la
// pantalla de vehículos.
//
// Importa porque el módulo de desinfección decide por `inactivo_origen` si
// puede reactivar un vehículo por su cuenta. Un motivo rancio o un NULL ahí es
// lo que separa «poner en servicio un carro al que le falta una desinfección»
// de «poner en servicio un carro accidentado».

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../config/db');
const { actualizar } = require('../vehiculos.controller');

function resFalso() {
  return {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  };
}

const USUARIO = { usuario: 'bortega', nombre: 'Brandon Ortega' };

/** Prepara las respuestas de la base: estado previo, UPDATE y SELECT final. */
function conEstadoPrevio(activoPrevio) {
  db.query
    .mockResolvedValueOnce([[{ activo: activoPrevio }]])   // SELECT activo
    .mockResolvedValueOnce([{ affectedRows: 1 }])          // UPDATE
    .mockResolvedValueOnce([[{ id: 3, activo: activoPrevio === 1 ? 0 : 1 }]]); // SELECT final
}

/** Los campos que viajaron en el UPDATE. */
function updateEnviado() {
  const llamada = db.query.mock.calls.find(c => /UPDATE vehiculos SET \?/.test(c[0]));
  return llamada ? llamada[1][0] : null;
}

beforeEach(() => { db.query.mockReset() });

describe('actualizar: transición de activo', () => {
  test('al bajarlo escribe origen MANUAL, motivo, fecha y quién', async () => {
    conEstadoPrevio(1);
    await actualizar({ params: { id: '3' }, body: { activo: false }, user: USUARIO }, resFalso(), e => { throw e });

    const u = updateEnviado();
    expect(u.activo).toBe(0);
    expect(u.inactivo_origen).toBe('MANUAL');
    expect(u.inactivo_por).toBe('bortega');
    expect(u.inactivo_at).toBeInstanceOf(Date);
    expect(u.inactivo_motivo).toMatch(/a mano/i);
  });

  test('respeta el motivo que manda el usuario y lo recorta al ancho de la columna', async () => {
    conEstadoPrevio(1);
    const largo = 'C'.repeat(500);
    await actualizar({ params: { id: '3' }, body: { activo: false, inactivo_motivo: largo }, user: USUARIO },
      resFalso(), e => { throw e });

    expect(updateEnviado().inactivo_motivo).toHaveLength(200);
  });

  test('al subirlo limpia las cuatro columnas', async () => {
    conEstadoPrevio(0);
    await actualizar({ params: { id: '3' }, body: { activo: true }, user: USUARIO }, resFalso(), e => { throw e });

    const u = updateEnviado();
    expect(u.activo).toBe(1);
    expect(u.inactivo_origen).toBeNull();
    expect(u.inactivo_motivo).toBeNull();
    expect(u.inactivo_at).toBeNull();
    expect(u.inactivo_por).toBeNull();
  });

  // El caso que protege al módulo de desinfección: si alguien manda activo:0
  // sobre un carro que ya estaba abajo por vencimiento y le pisamos el origen a
  // MANUAL, el módulo pierde la capacidad de volver a subirlo cuando por fin se
  // registre la desinfección, y nadie entendería por qué.
  test('activo:0 sobre uno que ya estaba abajo no le pisa el origen', async () => {
    conEstadoPrevio(0);
    await actualizar({ params: { id: '3' }, body: { activo: false }, user: USUARIO }, resFalso(), e => { throw e });

    const u = updateEnviado();
    expect(u).not.toHaveProperty('inactivo_origen');
    expect(u).not.toHaveProperty('inactivo_motivo');
  });

  test('activo:1 sobre uno que ya estaba arriba no toca nada de inactivación', async () => {
    conEstadoPrevio(1);
    await actualizar({ params: { id: '3' }, body: { activo: true }, user: USUARIO }, resFalso(), e => { throw e });

    expect(updateEnviado()).not.toHaveProperty('inactivo_origen');
  });

  // Editar la placa o el tipo no debe tocar el estado de inactivación ni
  // gastar una consulta averiguándolo.
  test('un cambio que no toca activo no consulta el estado previo', async () => {
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 3 }]]);
    await actualizar({ params: { id: '3' }, body: { marca: 'Chevrolet' }, user: USUARIO }, resFalso(), e => { throw e });

    expect(updateEnviado()).not.toHaveProperty('inactivo_origen');
    expect(db.query.mock.calls.some(c => /SELECT activo FROM vehiculos/.test(c[0]))).toBe(false);
  });

  test('vehículo inexistente al mover activo: 404', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = resFalso();
    await actualizar({ params: { id: '99' }, body: { activo: false }, user: USUARIO }, res, e => { throw e });

    expect(res.codigo).toBe(404);
    expect(updateEnviado()).toBeNull();
  });

  test('sin usuario en la petición no revienta: deja el autor en null', async () => {
    conEstadoPrevio(1);
    await actualizar({ params: { id: '3' }, body: { activo: false } }, resFalso(), e => { throw e });

    expect(updateEnviado().inactivo_por).toBeNull();
  });
});
