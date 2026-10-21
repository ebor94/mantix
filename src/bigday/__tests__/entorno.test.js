const { leerEntorno } = require('../config/entorno');

const completo = {
  BIGDAY_DB_HOST: 'bd.interna',
  BIGDAY_DB_USER: 'bigday_api',
  BIGDAY_DB_PASSWORD: 'secreto',
  BIGDAY_HASH_SALT: 'sal',
};

describe('leerEntorno', () => {
  it('con las variables obligatorias devuelve la configuración y los valores por defecto', () => {
    const e = leerEntorno(completo);
    expect(e.ok).toBe(true);
    expect(e.config).toEqual({
      hashSalt: 'sal',
      resultsToken: null,
      db: { host: 'bd.interna', port: 3306, user: 'bigday_api', password: 'secreto', database: 'serfuweb' },
    });
  });

  it('BIGDAY_RESULTS_TOKEN es opcional: no cuenta como faltante y se lee recortado', () => {
    expect(leerEntorno(completo).ok).toBe(true);
    expect(leerEntorno({ ...completo, BIGDAY_RESULTS_TOKEN: '   ' }).config.resultsToken).toBeNull();
    expect(leerEntorno({ ...completo, BIGDAY_RESULTS_TOKEN: '' }).config.resultsToken).toBeNull();
    expect(leerEntorno({ ...completo, BIGDAY_RESULTS_TOKEN: ' abc123 ' }).config.resultsToken).toBe('abc123');
  });

  it('respeta puerto y base indicados', () => {
    const e = leerEntorno({ ...completo, BIGDAY_DB_PORT: '33307', BIGDAY_DB_NAME: 'otra' });
    expect(e.config.db).toMatchObject({ port: 33307, database: 'otra' });
  });

  it('lista las variables faltantes (vacías cuentan como faltantes) sin exponer valores', () => {
    const e = leerEntorno({ BIGDAY_DB_HOST: 'x', BIGDAY_HASH_SALT: '  ' });
    expect(e.ok).toBe(false);
    expect(e.faltantes).toEqual(['BIGDAY_DB_USER', 'BIGDAY_DB_PASSWORD', 'BIGDAY_HASH_SALT']);
  });
});
