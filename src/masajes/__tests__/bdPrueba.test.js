const { validarBdPrueba } = require('../testing/bd');

test('host remoto → lanza', () => {
  expect(() => validarBdPrueba({ DB_HOST: 'db.prod.example.com', DB_NAME: 'masajes_test' }))
    .toThrow(/solo corren contra MySQL local \(recibido: db\.prod\.example\.com\)/);
});

test('nombre sin _test → lanza (incluida la base de producción)', () => {
  expect(() => validarBdPrueba({ DB_HOST: '127.0.0.1', DB_NAME: 'serfuweb' })).toThrow(/_test/);
  expect(() => validarBdPrueba({ DB_HOST: '127.0.0.1', DB_NAME: undefined })).toThrow(/_test/);
});

test('127.0.0.1, localhost y ::1 con masajes_test → no lanza', () => {
  for (const DB_HOST of ['127.0.0.1', 'localhost', '::1']) {
    expect(() => validarBdPrueba({ DB_HOST, DB_NAME: 'masajes_test' })).not.toThrow();
  }
});
