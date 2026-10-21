const { configBdPrueba } = require('../testing/guardaBd');

describe('configBdPrueba (guarda de las pruebas destructivas)', () => {
  const base = { BIGDAY_TEST_DB_HOST: '127.0.0.1', BIGDAY_TEST_DB_NAME: 'bigday_test' };
  it('acepta host local con nombre explícito', () => {
    expect(configBdPrueba(base).ok).toBe(true);
    expect(configBdPrueba({ ...base, BIGDAY_TEST_DB_HOST: 'localhost' }).cfg.database).toBe('bigday_test');
  });
  it('rechaza host remoto, sin nombre o sin host', () => {
    expect(configBdPrueba({ ...base, BIGDAY_TEST_DB_HOST: 'prod.interna' }).ok).toBe(false);
    expect(configBdPrueba({ BIGDAY_TEST_DB_HOST: '127.0.0.1' }).ok).toBe(false);
    expect(configBdPrueba({ ...base, BIGDAY_TEST_DB_NAME: '  ' }).ok).toBe(false);
    expect(configBdPrueba({}).ok).toBe(false);
  });
});
