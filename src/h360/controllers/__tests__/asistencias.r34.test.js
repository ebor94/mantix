// F-10: los R-34 emitidos para el contrato de una asistencia.
//
// Son órdenes firmadas a proveedores, con el valor pactado. Dos cosas tienen
// que quedar clavadas: que el contrato lo resuelva el servidor (y no quien
// llama, que podría pedir los R-34 de un caso ajeno) y que la fecha de entrega
// no se corra un día al salir.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const db = require('../../config/db');
const { r34DeLaAsistencia } = require('../asistencias.controller');

function resFalso() {
  const res = {
    codigo: 200,
    cuerpo: undefined,
    status(c) { this.codigo = c; return this },
    json(b)   { this.cuerpo = b; return this },
  };
  return res;
}

const EMITIDOS = [
  { id: 2, consecutivo: 'SERV-10646', grupo: 'RAMOS',   fecha_entrega: '2026-11-10' },
  { id: 1, consecutivo: 'SERV-10645', grupo: 'CARROZA', fecha_entrega: '2026-11-10' },
];

beforeEach(() => { db.query.mockReset() });

describe('r34DeLaAsistencia', () => {
  test('asistencia que no existe: 404 y no se consulta la tabla de R-34', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = resFalso();
    await r34DeLaAsistencia({ params: { id: '999' } }, res, e => { throw e });

    expect(res.codigo).toBe(404);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  // El número de contrato se registra en el encuentro (F-05): antes de eso el
  // caso no tiene orden en el ERP y la pestaña no tiene nada que mostrar.
  test('caso sin contrato: lista vacía sin tocar h360_r34', async () => {
    db.query.mockResolvedValueOnce([[{ contrato: null }]]);
    const res = resFalso();
    await r34DeLaAsistencia({ params: { id: '7' } }, res, e => { throw e });

    expect(res.cuerpo).toEqual({ contrato: null, emitidos: [] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  // "0", "PTE" y "N/A" son los rellenos que se escribían cuando no se tenía el
  // número. Buscar por ellos traería los R-34 de cualquier otro caso rellenado
  // igual, que no son de este contrato.
  test.each(['0', 'PTE', 'N/A', '  ', '-'])('relleno %p no se usa para buscar', async (relleno) => {
    db.query.mockResolvedValueOnce([[{ contrato: relleno }]]);
    const res = resFalso();
    await r34DeLaAsistencia({ params: { id: '7' } }, res, e => { throw e });

    expect(res.cuerpo).toEqual({ contrato: null, emitidos: [] });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('contrato válido: devuelve los R-34 de ese contrato', async () => {
    db.query
      .mockResolvedValueOnce([[{ contrato: '42303' }]])
      .mockResolvedValueOnce([EMITIDOS]);
    const res = resFalso();
    await r34DeLaAsistencia({ params: { id: '351' } }, res, e => { throw e });

    expect(res.codigo).toBe(200);
    expect(res.cuerpo).toEqual({ contrato: '42303', emitidos: EMITIDOS });
  });

  // Lo que se consulta es el contrato que tiene la asistencia en la base, no
  // uno que venga en la petición: si no, con cambiar la URL se leen los R-34
  // (y los valores pactados) de un caso que no es el que se está viendo.
  test('el contrato sale de la base, no de la petición', async () => {
    db.query
      .mockResolvedValueOnce([[{ contrato: '42303' }]])
      .mockResolvedValueOnce([EMITIDOS]);
    const res = resFalso();
    await r34DeLaAsistencia(
      { params: { id: '351' }, query: { contrato: '99999' }, body: { contrato: '99999' } },
      res, e => { throw e });

    const [, params] = db.query.mock.calls[1];
    expect(params).toEqual(['42303']);
    expect(res.cuerpo.contrato).toBe('42303');
  });

  // fecha_entrega es un DATE. Devuelto como objeto, Express lo serializa en UTC
  // y en Colombia la pantalla muestra el día anterior: una entrega del 10 sale
  // como 9. Por eso se formatea en SQL.
  test('la fecha de entrega se formatea en SQL, no se manda como Date', async () => {
    db.query
      .mockResolvedValueOnce([[{ contrato: '42303' }]])
      .mockResolvedValueOnce([EMITIDOS]);
    await r34DeLaAsistencia({ params: { id: '351' } }, resFalso(), e => { throw e });

    const [sql] = db.query.mock.calls[1];
    expect(sql).toMatch(/DATE_FORMAT\(fecha_entrega, '%Y-%m-%d'\) AS fecha_entrega/);
  });

  test('los más nuevos primero, por consecutivo', async () => {
    db.query
      .mockResolvedValueOnce([[{ contrato: '42303' }]])
      .mockResolvedValueOnce([EMITIDOS]);
    await r34DeLaAsistencia({ params: { id: '351' } }, resFalso(), e => { throw e });

    const [sql] = db.query.mock.calls[1];
    expect(sql).toMatch(/ORDER BY consecutivo_num DESC/);
  });

  test('un fallo de la base va al manejador de errores, no se traga', async () => {
    db.query.mockRejectedValueOnce(new Error('ER_NO_SUCH_TABLE'));
    const next = jest.fn();
    await r34DeLaAsistencia({ params: { id: '351' } }, resFalso(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_NO_SUCH_TABLE' }));
  });
});
