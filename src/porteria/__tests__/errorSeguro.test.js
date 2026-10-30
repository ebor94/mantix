const { errorParaLog } = require('../utils/errorSeguro');

test('error con forma mysql2: conserva code/errno/sqlState y nunca el contenido del usuario', () => {
  const err = Object.assign(new Error("Duplicate entry 'ABC123' for key 'placa'"), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlState: '23000',
    sqlMessage: "Duplicate entry 'ABC123' for key 'placa'",
    sql: "INSERT INTO por_vehiculos (placa) VALUES ('ABC123')",
    parameters: ['ABC123'],
  });
  const salida = errorParaLog(err);
  expect(salida).toMatchObject({ codigo: 'ER_DUP_ENTRY', errno: 1062, sqlState: '23000' });
  expect(JSON.stringify(salida)).not.toContain('ABC123');
});

test('null o no-objeto → {}', () => {
  expect(errorParaLog(null)).toEqual({});
  expect(errorParaLog(undefined)).toEqual({});
});
