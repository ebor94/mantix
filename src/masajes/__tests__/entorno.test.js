const { leerEntorno, leerConexion, leerIntegraciones } = require('../config/entorno');

const BASE = Object.freeze({
  DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p',
  JWT_SECRET: 'a'.repeat(40), PORTERIA_JWT_SECRET: 'b'.repeat(40),
  MASAJES_JWT_SECRET: 'm'.repeat(40),
  MSJ_GRUPO_ADMIN_DN: 'CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local',
  LDAP_URL: 'ldaps://dc.olivos.local', LDAP_BASE_DN: 'DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'x',
});
const leer = (extra = {}) => leerEntorno({ ...BASE, ...extra });

describe('leerEntorno', () => {
  test('valores por defecto', () => {
    const { ok, config } = leer();
    expect(ok).toBe(true);
    expect(config.tz).toBe('America/Bogota');
    expect(config.franjas).toEqual(['08:00', '09:00', '10:00', '14:00', '15:00', '16:00']);
    expect(config.duracionMin).toBe(60);
    expect(config.anticipacionAgendarH).toBe(24);
    expect(config.anticipacionModificarH).toBe(24);
    expect(config.smsTopeDiario).toBe(100);
    expect(config.jwtExpires).toBe('8h');
    expect(config.grupoAdminDn).toBe('cn=gg-masajes-admin,ou=grupos,dc=olivos,dc=local');
    expect(config.dominiosAutovinculo).toEqual(['losolivos.co']);
    expect(config.db).toEqual({ host: 'h', port: 3306, user: 'u', password: 'p', database: 'serfuweb' });
  });

  test('lee overrides y recorta espacios', () => {
    const { config } = leer({ MSJ_ANTICIPACION_AGENDAR_H: ' 2 ', MSJ_FRANJAS: '08:00, 09:00', MSJ_DOMINIOS_AUTOVINCULO: 'A.co, b.co' });
    expect(config.anticipacionAgendarH).toBe(2);
    expect(config.franjas).toEqual(['08:00', '09:00']);
    expect(config.dominiosAutovinculo).toEqual(['a.co', 'b.co']);
  });

  test.each([
    ['MSJ_ANTICIPACION_AGENDAR_H', 'veinticuatro'],
    ['MSJ_ANTICIPACION_MODIFICAR_H', '1.5'],
    ['MSJ_DURACION_MIN', '5'],
    ['MSJ_SMS_TOPE_DIARIO', '0'],
  ])('%s=%s → no ok, nunca NaN silencioso', (nombre, valor) => {
    const r = leer({ [nombre]: valor });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(nombre);
  });

  test('franjas mal formadas → no ok', () => {
    expect(leer({ MSJ_FRANJAS: '08:00, 9am' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_FRANJAS/) });
    expect(leer({ MSJ_FRANJAS: '08:30' }).ok).toBe(false);
  });

  test('secreto ausente, corto o igual al de otro módulo → no ok', () => {
    expect(leer({ MASAJES_JWT_SECRET: '' }).ok).toBe(false);
    expect(leer({ MASAJES_JWT_SECRET: 'corto' }).ok).toBe(false);
    expect(leer({ MASAJES_JWT_SECRET: 'b'.repeat(40) }).ok).toBe(false); // = PORTERIA_JWT_SECRET
    expect(leer({ MASAJES_JWT_SECRET: 'a'.repeat(40) }).ok).toBe(false); // = JWT_SECRET
  });

  test('el secreto no puede repetir el de ningún otro módulo del repositorio', () => {
    for (const otro of ['SV_JWT_SECRET', 'SV_JWT_REFRESH_SECRET', 'IDENTIDAD_JWT_REFRESH_SECRET', 'VOTACION_JWT_SECRET', 'HASH_SECRET']) {
      expect([otro, leer({ [otro]: 'm'.repeat(40) }).ok]).toEqual([otro, false]);
    }
  });

  test('el token de admin dura menos (2 h por defecto) y se valida', () => {
    expect(leer().config.jwtExpiresAdmin).toBe('2h');
    expect(leer({ MASAJES_JWT_EXPIRES_ADMIN: '30m' }).config.jwtExpiresAdmin).toBe('30m');
    expect(leer({ MASAJES_JWT_EXPIRES_ADMIN: '1d' }).ok).toBe(false);
  });

  test('vigencia del token inválida → no ok', () => {
    expect(leer({ MASAJES_JWT_EXPIRES: '8' }).ok).toBe(false); // sin unidad jsonwebtoken lo leería como segundos
    expect(leer({ MASAJES_JWT_EXPIRES: '7d' }).ok).toBe(false);
    expect(leer({ MASAJES_JWT_EXPIRES: '30m' }).config.jwtExpires).toBe('30m');
  });

  test('el grupo admin debe ser un DN completo, no un CN suelto', () => {
    expect(leer({ MSJ_GRUPO_ADMIN_DN: 'GG-Masajes-Admin' }).ok).toBe(false);
    expect(leer({ MSJ_GRUPO_ADMIN_DN: '' }).ok).toBe(false);
  });

  test('MSJ_APP_URL debe ser https (va como enlace en los correos)', () => {
    expect(leer({ MSJ_APP_URL: 'javascript:alert(1)' }).ok).toBe(false);
    expect(leer({ MSJ_APP_URL: 'http://mantix.losolivos.co/masajes' }).ok).toBe(false);
    expect(leer({ MSJ_APP_URL: 'https://mantix.losolivos.co/masajes" onclick="x' }).ok).toBe(false);
    expect(leer({ MSJ_APP_URL: 'https://mantix.losolivos.co/masajes' }).config.appUrl).toBe('https://mantix.losolivos.co/masajes');
  });

  test('sin la configuración del directorio activo el módulo queda deshabilitado (el login no podría funcionar)', () => {
    expect(leer({ LDAP_URL: '' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/LDAP_URL/) });
    expect(leer({ LDAP_BIND_PASS: '' }).ok).toBe(false);
    expect(leer({ LDAP_URL: 'http://dc' }).ok).toBe(false);
  });

  test('nunca lanza', () => {
    expect(() => leerEntorno({})).not.toThrow();
    expect(leerEntorno({}).ok).toBe(false);
  });
});

describe('leerConexion', () => {
  test('usa MSJ_DB_USER si está definido; si no, advierte', () => {
    expect(leerConexion({ ...BASE }).advertencia).toMatch(/MSJ_DB_USER/);
    const propia = leerConexion({ ...BASE, MSJ_DB_USER: 'msj', MSJ_DB_PASSWORD: 'x', DB_PORT: '3307', DB_NAME: 'otra' });
    expect(propia.advertencia).toBeNull();
    expect(propia.db).toEqual({ host: 'h', port: 3307, user: 'msj', password: 'x', database: 'otra' });
  });

  test('para migrar usa siempre DB_USER (el de mínimo privilegio no puede crear tablas)', () => {
    const c = leerConexion({ ...BASE, MSJ_DB_USER: 'msj', MSJ_DB_PASSWORD: 'x' }, { paraMigrar: true });
    expect(c.db).toMatchObject({ user: 'u', password: 'p' });
    expect(c.advertencia).toBeNull();
  });

  test('faltan variables de conexión → no ok', () => {
    expect(leerConexion({ DB_HOST: 'h' })).toEqual({ ok: false, motivo: 'Faltan variables: DB_USER, DB_PASSWORD' });
  });
});

describe('leerIntegraciones', () => {
  const INTEG = {
    MSJ_SPA_EMAIL: 'spa@x.co', MSJ_GOOGLE_CALENDAR_ID: 'cal', MSJ_GOOGLE_IMPERSONAR: 'agenda@losolivos.co',
    MSJ_GOOGLE_SA_JSON: '/etc/sa.json', MSJ_HABLAME_URL: 'https://api.hablame.co/x', MSJ_HABLAME_API_KEY: 'k',
  };

  test('exige los secretos de las integraciones', () => {
    expect(leerIntegraciones({})).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_HABLAME_API_KEY/) });
    expect(leerIntegraciones(INTEG).ok).toBe(true);
  });

  test('Háblame solo por https', () => {
    expect(leerIntegraciones({ ...INTEG, MSJ_HABLAME_URL: 'http://api.hablame.co/x' }).ok).toBe(false);
  });

  test('MSJ_SPA_EMAIL debe ser un solo correo (una coma al final lo rompe)', () => {
    expect(leerIntegraciones({ ...INTEG, MSJ_SPA_EMAIL: 'spa@x.co,' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_SPA_EMAIL/) });
    expect(leerIntegraciones({ ...INTEG, MSJ_SPA_EMAIL: 'a@x.co,b@x.co' }).ok).toBe(false);
  });

  describe('con n8n', () => {
    const N8N = { MSJ_SPA_EMAIL: 'spa@x.co', MSJ_HABLAME_URL: 'https://api.hablame.co/x', MSJ_HABLAME_API_KEY: 'k',
      MSJ_N8N_WEBHOOK_URL: 'http://192.9.17.10:5678/webhook/masajes-avisos', MSJ_N8N_SECRETO: 'z'.repeat(40) };

    test('no exige las variables de Google y arma config.n8n', () => {
      const r = leerIntegraciones(N8N);
      expect(r.ok).toBe(true);
      expect(r.config).toMatchObject({ n8n: { url: N8N.MSJ_N8N_WEBHOOK_URL, secreto: N8N.MSJ_N8N_SECRETO }, google: null });
    });

    test('exige el secreto, de 32 caracteres o más, y una URL http(s)', () => {
      expect(leerIntegraciones({ ...N8N, MSJ_N8N_SECRETO: '' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_N8N_SECRETO/) });
      expect(leerIntegraciones({ ...N8N, MSJ_N8N_SECRETO: 'corto' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/32/) });
      expect(leerIntegraciones({ ...N8N, MSJ_N8N_WEBHOOK_URL: 'ftp://x' }).ok).toBe(false);
    });

    test('sin n8n se siguen exigiendo las de Google', () => {
      const { MSJ_N8N_WEBHOOK_URL, MSJ_N8N_SECRETO, ...sinN8n } = N8N;
      expect(leerIntegraciones(sinN8n)).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_GOOGLE_CALENDAR_ID/) });
    });
  });
});
