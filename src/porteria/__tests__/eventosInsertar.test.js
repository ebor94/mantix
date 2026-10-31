// src/porteria/__tests__/eventosInsertar.test.js
const { insertar } = require('../repositorios/eventos');

const conn = (error) => ({ query: jest.fn(async () => { if (error) throw error; return [{ insertId: 7 }]; }) });

test('un motivo borrado durante el registro (FK 1452) → 422 VALIDACION', async () => {
  const err = await insertar(conn(Object.assign(new Error('FK'), { errno: 1452 })), { motivo_id: 99 }).then(() => null, (e) => e);
  expect(err).toMatchObject({ statusCode: 422, motivo: 'VALIDACION', message: 'El motivo no aplica a este vehículo o sentido' });
});

test('otros errores del INSERT se relanzan tal cual', async () => {
  const original = Object.assign(new Error('Deadlock'), { errno: 1213 });
  await expect(insertar(conn(original), {})).rejects.toBe(original);
});

test('devuelve el id insertado', async () => {
  await expect(insertar(conn(), {})).resolves.toBe(7);
});
