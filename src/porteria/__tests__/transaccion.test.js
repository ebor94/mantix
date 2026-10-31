// src/porteria/__tests__/transaccion.test.js
const { conTransaccion } = require('../utils/transaccion');

function bdFalsa() {
  const conexiones = [];
  return {
    conexiones,
    obtener: () => ({
      getConnection: async () => {
        const c = {
          beginTransaction: jest.fn(async () => {}),
          commit: jest.fn(async () => {}),
          rollback: jest.fn(async () => {}),
          release: jest.fn(),
          destroy: jest.fn(),
        };
        conexiones.push(c);
        return c;
      },
    }),
  };
}
const deadlock = () => Object.assign(new Error('Deadlock found'), { errno: 1213 });

test('confirma, devuelve el resultado y libera la conexión', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => 42)).resolves.toBe(42);
  const [c] = bd.conexiones;
  expect(c.beginTransaction).toHaveBeenCalled();
  expect(c.commit).toHaveBeenCalled();
  expect(c.rollback).not.toHaveBeenCalled();
  expect(c.release).toHaveBeenCalled();
});

test('ante un error revierte, libera y relanza', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
  const [c] = bd.conexiones;
  expect(c.rollback).toHaveBeenCalled();
  expect(c.commit).not.toHaveBeenCalled();
  expect(c.release).toHaveBeenCalled();
  expect(bd.conexiones).toHaveLength(1);
});

test('un deadlock se reintenta una vez con otra conexión', async () => {
  const bd = bdFalsa();
  let intentos = 0;
  const resultado = await conTransaccion(bd, async () => {
    intentos += 1;
    if (intentos === 1) throw deadlock();
    return 'ok';
  });
  expect(resultado).toBe('ok');
  expect(bd.conexiones).toHaveLength(2);
  expect(bd.conexiones.every((c) => c.release.mock.calls.length === 1)).toBe(true);
});

test('un deadlock persistente tras el reintento → 409 OCUPADO', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => { throw deadlock(); })).rejects.toMatchObject({
    statusCode: 409, motivo: 'OCUPADO', message: 'Otro registro de esta placa está en curso. Intenta de nuevo.',
  });
  expect(bd.conexiones).toHaveLength(2);
});

test('un timeout de bloqueo (1205) no se reintenta y es 409 OCUPADO', async () => {
  const bd = bdFalsa();
  const err = await conTransaccion(bd, async () => { throw Object.assign(new Error('Lock wait timeout'), { errno: 1205 }); })
    .then(() => undefined, (e) => e);
  expect(err).toMatchObject({ statusCode: 409, motivo: 'OCUPADO' });
  expect(bd.conexiones).toHaveLength(1);
});

test('si el rollback falla, la conexión se destruye y no se libera', async () => {
  const bd = bdFalsa();
  const original = bd.obtener;
  bd.obtener = () => {
    const pool = original();
    return {
      getConnection: async () => {
        const c = await pool.getConnection();
        c.rollback = jest.fn(async () => { throw new Error('conexión caída'); });
        return c;
      },
    };
  };
  await expect(conTransaccion(bd, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
  const [c] = bd.conexiones;
  expect(c.destroy).toHaveBeenCalled();
  expect(c.release).not.toHaveBeenCalled();
});

test('mensajeOcupado reemplaza el mensaje del 409 OCUPADO', async () => {
  const bd = bdFalsa();
  const err = await conTransaccion(bd, async () => { throw deadlock(); }, { mensajeOcupado: 'Otro cambio en curso.' })
    .then(() => undefined, (e) => e);
  expect(err).toMatchObject({ statusCode: 409, motivo: 'OCUPADO', message: 'Otro cambio en curso.' });
});
