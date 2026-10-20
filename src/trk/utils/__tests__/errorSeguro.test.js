const { errorParaLog } = require('../errorSeguro');

const errorDuplicado = () => ({
  name: 'SequelizeUniqueConstraintError',
  message: "Duplicate entry '1004123456' for key 'x'",
  stack: "SequelizeUniqueConstraintError: Duplicate entry '1004123456'...\n    at foo (a.js:1:1)",
  parent: { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry '1004123456'", sql: 'INSERT ... 1004123456' },
  fields: { documento: '1004123456' },
  parameters: ['1004123456']
});

test('errorParaLog no filtra datos personales: sin message, sql, sqlMessage, fields ni parameters', () => {
  const r = errorParaLog(errorDuplicado());
  const s = JSON.stringify(r);
  expect(s).not.toContain('1004123456');
  expect(s).toContain('ER_DUP_ENTRY');
  expect(s).toContain('at foo');
  expect(r.name).toBe('SequelizeUniqueConstraintError');
});

test('errorParaLog tolera valores no-Error', () => {
  expect(errorParaLog(undefined)).toEqual({});
  expect(errorParaLog('1004123456')).toEqual({});
  expect(errorParaLog({ name: 'X', original: { code: 'E1' } })).toEqual({ name: 'X', codigo: 'E1' });
});
