// Qué impide borrar un vehículo.
//
// Son dos cosas distintas y las dos importan: las exequias asociadas (que ya se
// comprobaban) y la historia de desinfecciones, que es la evidencia sanitaria
// que reemplazó al talonario físico. La llave foránea de h360_desinf_registro
// es RESTRICT, así que sin la comprobación el DELETE revienta en la base y el
// usuario recibe un 500 en vez de saber qué hacer.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../config/db');
const { eliminar } = require('../vehiculos.controller');

function resFalso() {
  return {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  };
}

const SIN_FILAS  = [[]];
const CON_FILAS  = [[{ 1: 1 }]];

beforeEach(() => { db.query.mockReset() });

describe('eliminar vehículo', () => {
  test('sin exequias ni desinfecciones: se borra', async () => {
    db.query
      .mockResolvedValueOnce(SIN_FILAS)            // exequias
      .mockResolvedValueOnce(SIN_FILAS)            // desinfecciones
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // delete
    const res = resFalso();
    await eliminar({ params: { id: '5' } }, res, e => { throw e });

    expect(res.cuerpo).toEqual({ ok: true });
    expect(db.query.mock.calls[2][0]).toMatch(/DELETE FROM vehiculos/);
  });

  test('con exequias asociadas: 409 y no se intenta borrar', async () => {
    db.query.mockResolvedValueOnce(CON_FILAS);
    const res = resFalso();
    await eliminar({ params: { id: '5' } }, res, e => { throw e });

    expect(res.codigo).toBe(409);
    expect(res.cuerpo.mensaje).toMatch(/exequias/i);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  // El caso nuevo: la historia sanitaria no se borra con el vehículo.
  test('con desinfecciones registradas: 409 y no se intenta borrar', async () => {
    db.query
      .mockResolvedValueOnce(SIN_FILAS)   // no tiene exequias
      .mockResolvedValueOnce(CON_FILAS);  // pero sí desinfecciones
    const res = resFalso();
    await eliminar({ params: { id: '5' } }, res, e => { throw e });

    expect(res.codigo).toBe(409);
    expect(res.cuerpo.mensaje).toMatch(/desinfecciones/i);
    // Tres llamadas serían: exequias, desinfecciones y el DELETE. Con dos, el
    // DELETE no se intentó, que es lo que evita el 500 de la llave foránea.
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('el mensaje dice qué hacer en su lugar', async () => {
    db.query
      .mockResolvedValueOnce(SIN_FILAS)
      .mockResolvedValueOnce(CON_FILAS);
    const res = resFalso();
    await eliminar({ params: { id: '5' } }, res, e => { throw e });

    expect(res.cuerpo.mensaje).toMatch(/inact[íi]valo/i);
  });

  test('un fallo de la base va al manejador de errores', async () => {
    db.query.mockRejectedValueOnce(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const next = jest.fn();
    await eliminar({ params: { id: '5' } }, resFalso(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_LOCK_WAIT_TIMEOUT' }));
  });
});
