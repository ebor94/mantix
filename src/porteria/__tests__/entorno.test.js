// src/porteria/__tests__/entorno.test.js
const { leerEntorno, leerConexion } = require('../config/entorno');

const base = () => ({
  DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p',
  PORTERIA_JWT_SECRET: 'x'.repeat(40),
  LDAP_GROUP_PORTERIA_GUARDA: 'PorteriaGuardas',
  LDAP_GROUP_PORTERIA_ADMIN: 'PorteriaAdmins',
});

describe('leerConexion', () => {
  test('usa las DB_* de Mantix con valores por defecto de puerto y base', () => {
    expect(leerConexion(base())).toEqual({
      ok: true, db: { host: 'h', port: 3306, user: 'u', password: 'p', database: 'serfuweb' },
    });
  });
  test('reporta las variables de conexión que faltan', () => {
    const r = leerConexion({ DB_HOST: 'h' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('Faltan variables: DB_USER, DB_PASSWORD');
  });
});

describe('leerEntorno', () => {
  test('configuración completa', () => {
    const r = leerEntorno({ ...base(), DB_PORT: '3310', DB_NAME: 'otra', LDAP_GROUP_ADMIN: 'Admins' });
    expect(r).toEqual({
      ok: true,
      advertencia: null,
      config: {
        jwtSecret: 'x'.repeat(40),
        jwtExpires: '12h',
        grupos: { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' },
        db: { host: 'h', port: 3310, user: 'u', password: 'p', database: 'otra' },
      },
    });
  });
  test('sin LDAP_GROUP_ADMIN el admin general queda en null y respeta PORTERIA_JWT_EXPIRES', () => {
    const r = leerEntorno({ ...base(), PORTERIA_JWT_EXPIRES: '8h' });
    expect(r.config.grupos.adminGeneral).toBeNull();
    expect(r.config.jwtExpires).toBe('8h');
  });
  test.each(['PORTERIA_JWT_SECRET', 'LDAP_GROUP_PORTERIA_GUARDA', 'LDAP_GROUP_PORTERIA_ADMIN', 'DB_HOST'])(
    'falta %s → deshabilitado', (variable) => {
      const env = { ...base(), [variable]: '   ' };
      const r = leerEntorno(env);
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain(variable);
    });
  test.each(['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET'])(
    'secreto igual a %s → deshabilitado', (otro) => {
      const env = { ...base(), [otro]: 'x'.repeat(40) };
      expect(leerEntorno(env)).toEqual({
        ok: false,
        motivo: 'PORTERIA_JWT_SECRET debe ser distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET',
      });
    });
  test('secreto corto solo advierte', () => {
    const r = leerEntorno({ ...base(), PORTERIA_JWT_SECRET: 'corto' });
    expect(r.ok).toBe(true);
    expect(r.advertencia).toBe('PORTERIA_JWT_SECRET tiene menos de 32 caracteres');
  });
});
