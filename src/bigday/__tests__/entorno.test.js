const { leerEntorno, leerConexion } = require('../config/entorno');

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
    expect(e.faltantes).toEqual(['BIGDAY_DB_USER o DB_USER', 'BIGDAY_DB_PASSWORD o DB_PASSWORD', 'BIGDAY_HASH_SALT']);
  });

  describe('reutilización de las variables DB_* de Mantix', () => {
    const mantix = { DB_HOST: 'mantix.bd', DB_PORT: '3310', DB_USER: 'mantix_u', DB_PASSWORD: 'mantix_p', DB_NAME: 'serfuweb' };

    it('con solo DB_* y BIGDAY_HASH_SALT el módulo queda operativo', () => {
      const e = leerEntorno({ ...mantix, BIGDAY_HASH_SALT: 'sal' });
      expect(e.ok).toBe(true);
      expect(e.config.resultsToken).toBeNull();
      expect(e.config.db).toEqual({ host: 'mantix.bd', port: 3310, user: 'mantix_u', password: 'mantix_p', database: 'serfuweb' });
    });

    it('un valor BIGDAY_DB_* explícito gana sobre el de Mantix', () => {
      const e = leerEntorno({
        ...mantix, BIGDAY_HASH_SALT: 'sal',
        BIGDAY_DB_HOST: 'bd.interna', BIGDAY_DB_PORT: '33307', BIGDAY_DB_USER: 'bigday_api',
        BIGDAY_DB_PASSWORD: 'secreto', BIGDAY_DB_NAME: 'otra',
      });
      expect(e.config.db).toEqual({ host: 'bd.interna', port: 33307, user: 'bigday_api', password: 'secreto', database: 'otra' });
    });

    it('un BIGDAY_DB_* vacío cae al valor de Mantix', () => {
      const e = leerEntorno({ ...mantix, BIGDAY_HASH_SALT: 'sal', BIGDAY_DB_HOST: '  ', BIGDAY_DB_USER: '' });
      expect(e.config.db).toMatchObject({ host: 'mantix.bd', user: 'mantix_u' });
    });

    it('el puerto por defecto es 3306 si no hay BIGDAY_DB_PORT ni DB_PORT', () => {
      const { DB_PORT, ...sinPuerto } = mantix;
      expect(leerEntorno({ ...sinPuerto, BIGDAY_HASH_SALT: 'sal' }).config.db.port).toBe(3306);
    });

    it('la base por defecto es serfuweb si no hay BIGDAY_DB_NAME ni DB_NAME', () => {
      const { DB_NAME, ...sinNombre } = mantix;
      expect(leerEntorno({ ...sinNombre, BIGDAY_HASH_SALT: 'sal' }).config.db.database).toBe('serfuweb');
    });

    it('si faltan ambas opciones lo indica nombrando las dos, sin lanzar', () => {
      const e = leerEntorno({ BIGDAY_HASH_SALT: 'sal' });
      expect(e.ok).toBe(false);
      expect(e.faltantes).toEqual(['BIGDAY_DB_HOST o DB_HOST', 'BIGDAY_DB_USER o DB_USER', 'BIGDAY_DB_PASSWORD o DB_PASSWORD']);
      expect(() => leerEntorno({})).not.toThrow();
    });
  });
});

describe('leerConexion (la usa bigday:migrate, no exige la sal)', () => {
  it('resuelve la conexión solo con DB_*', () => {
    const e = leerConexion({ DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'serfuweb' });
    expect(e).toEqual({ ok: true, db: { host: 'h', port: 3306, user: 'u', password: 'p', database: 'serfuweb' } });
  });

  it('si faltan datos, los lista nombrando ambas opciones', () => {
    expect(leerConexion({ DB_HOST: 'h' })).toEqual({ ok: false, faltantes: ['BIGDAY_DB_USER o DB_USER', 'BIGDAY_DB_PASSWORD o DB_PASSWORD'] });
  });
});
