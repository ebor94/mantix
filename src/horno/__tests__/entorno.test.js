const { leerEntorno } = require('../config/entorno');

const base = () => ({
  HORNO_DB_HOST: '192.9.17.30', HORNO_DB_USER: 'incol_api', HORNO_DB_PASSWORD: 'x',
  HORNO_JWT_SECRET: 'h'.repeat(40),
  LDAP_URL: 'ldap://ad', LDAP_BASE_DN: 'DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'p',
});

test('con lo mínimo aplica los valores por defecto', () => {
  const e = leerEntorno(base());
  expect(e.ok).toBe(true);
  expect(e.advertencia).toBeNull();
  expect(e.config).toEqual({
    jwtSecret: 'h'.repeat(40), jwtExpires: '8h', grupo: 'INCOL_APP',
    db: { host: '192.9.17.30', port: 3306, user: 'incol_api', password: 'x', database: 'horno' },
  });
});

test('lista las variables que faltan, sin valores', () => {
  const env = base();
  delete env.HORNO_DB_PASSWORD;
  env.LDAP_URL = '  ';
  expect(leerEntorno(env)).toEqual({ ok: false, motivo: 'Faltan variables: HORNO_DB_PASSWORD, LDAP_URL' });
});

test('no usa las DB_* de Mantix como respaldo', () => {
  const env = base();
  delete env.HORNO_DB_HOST;
  env.DB_HOST = 'localhost';
  expect(leerEntorno(env).ok).toBe(false);
});

test('rechaza un secreto igual al de otro módulo', () => {
  const env = { ...base(), JWT_SECRET: 'h'.repeat(40) };
  const e = leerEntorno(env);
  expect(e.ok).toBe(false);
  expect(e.motivo).toMatch(/distinto/);
});

test('rechaza HORNO_JWT_EXPIRES y HORNO_DB_PORT inválidos', () => {
  expect(leerEntorno({ ...base(), HORNO_JWT_EXPIRES: '8 horas' }).ok).toBe(false);
  expect(leerEntorno({ ...base(), HORNO_DB_PORT: 'abc' }).ok).toBe(false);
});

test('acepta grupo, puerto, base y expiración propios', () => {
  const e = leerEntorno({
    ...base(), HORNO_GRUPO_AD: ' INCOL_APP_TEST ', HORNO_DB_PORT: '3307', HORNO_DB_NAME: 'horno_test', HORNO_JWT_EXPIRES: '2h',
  });
  expect(e.config.grupo).toBe('INCOL_APP_TEST');
  expect(e.config.db.port).toBe(3307);
  expect(e.config.db.database).toBe('horno_test');
  expect(e.config.jwtExpires).toBe('2h');
});

test('advierte si el secreto es corto', () => {
  expect(leerEntorno({ ...base(), HORNO_JWT_SECRET: 'corto' }).advertencia).toMatch(/32/);
});
