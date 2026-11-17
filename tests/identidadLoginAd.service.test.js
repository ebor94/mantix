jest.mock('../src/identity/models', () => ({
  sequelize:     { query: jest.fn() },
  OrgIdentidad:  { findOne: jest.fn(), findByPk: jest.fn() },
  OrgSesion:     { create: jest.fn(), findOne: jest.fn(), destroy: jest.fn() },
  OrgAplicacion: { findAll: jest.fn() }
}));
jest.mock('../src/identity/config/jwt', () => ({
  signAccess:  jest.fn(() => 'access-token'),
  signRefresh: jest.fn(() => 'refresh-token'),
  verifyRefresh: jest.fn()
}));
jest.mock('../src/h360/services/ldap.service', () => ({ validarCredenciales: jest.fn() }));
jest.mock('../src/identity/services/vinculoAd.service', () => {
  const real = jest.requireActual('../src/identity/services/vinculoAd.service');
  return { ...real, vincularAdUsuario: jest.fn(async (i, ad) => Object.assign(i, { ad_usuario: ad })) };
});

const { OrgIdentidad, OrgSesion } = require('../src/identity/models');
const ldap = require('../src/h360/services/ldap.service');
const { vincularAdUsuario } = require('../src/identity/services/vinculoAd.service');
const identidadSvc = require('../src/identity/services/identidad.service');

function identidad(campos = {}) {
  const i = {
    id_identidad: 1, email_norm: 'psantafe@losolivos.co', ad_usuario: 'psantafe',
    nombre: 'Patricia', apellido: 'Santafé', telefono: null, activo: 1, ultimo_login: null,
    ...campos
  };
  i.update = jest.fn(async (p) => Object.assign(i, p));
  return i;
}

function errorAd(codigo, message) { const e = new Error(message); e.codigo = codigo; return e; }

// findOne responde según el where que recibe.
function responderFindOne(mapa) {
  OrgIdentidad.findOne.mockImplementation(async ({ where }) => {
    if (where.ad_usuario !== undefined && where.email_norm === undefined) return mapa.porAd?.[where.ad_usuario] ?? null;
    if (where.email_norm !== undefined && where.ad_usuario === null) return mapa.libresPorCorreo?.[where.email_norm] ?? null;
    if (where.email_norm !== undefined) return mapa.porCorreo?.[where.email_norm] ?? null;
    return null;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  OrgSesion.create.mockResolvedValue({});
});
afterEach(() => console.log.mockRestore());

const AD_OK = { usuario: 'PSANTAFE', nombre: 'Patricia Santafé', email: 'psantafe@losolivos.co', memberOf: [] };

describe('identidad.login contra el AD', () => {
  test('usuario de red: valida en el AD y emite tokens', async () => {
    const i = identidad();
    responderFindOne({ porAd: { psantafe: i } });
    ldap.validarCredenciales.mockResolvedValue(AD_OK);

    const r = await identidadSvc.login({ usuario: 'PSantafe', password: 'clave', ua: 'jest', ip: '1.1.1.1' });

    expect(ldap.validarCredenciales).toHaveBeenCalledWith('PSantafe', 'clave');
    expect(r.accessToken).toBe('access-token');
    expect(r.refreshToken).toBe('refresh-token');
    expect(r.identidad).toMatchObject({ id_identidad: 1, ad_usuario: 'psantafe' });
    expect(r).not.toHaveProperty('must_reset');
    expect(r.identidad).not.toHaveProperty('must_reset');
    expect(OrgSesion.create).toHaveBeenCalled();
    expect(i.update).toHaveBeenCalledWith(expect.objectContaining({ ultimo_login: expect.any(Date) }));
  });

  test('correo vinculado: usa el ad_usuario guardado para validar', async () => {
    const i = identidad();
    responderFindOne({ porCorreo: { 'psantafe@losolivos.co': i }, porAd: { psantafe: i } });
    ldap.validarCredenciales.mockResolvedValue(AD_OK);

    await identidadSvc.login({ usuario: 'PSantafe@LosOlivos.co', password: 'clave' });

    expect(ldap.validarCredenciales).toHaveBeenCalledWith('psantafe', 'clave');
  });

  test('correo sin vincular: NO_VINCULADO y no consulta el AD', async () => {
    responderFindOne({ porCorreo: { 'nuevo@losolivos.co': identidad({ ad_usuario: null, email_norm: 'nuevo@losolivos.co' }) } });
    await expect(identidadSvc.login({ usuario: 'nuevo@losolivos.co', password: 'x' }))
      .rejects.toMatchObject({ code: 'NO_VINCULADO', message: 'Inicia sesión con tu usuario de red (el de Windows).' });
    expect(ldap.validarCredenciales).not.toHaveBeenCalled();
  });

  test('correo inexistente: mensaje genérico', async () => {
    responderFindOne({});
    await expect(identidadSvc.login({ usuario: 'nadie@x.co', password: 'x' }))
      .rejects.toMatchObject({ code: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos' });
  });

  test('vinculación automática cuando el mail del AD coincide con una identidad libre', async () => {
    const libre = identidad({ ad_usuario: null });
    responderFindOne({ libresPorCorreo: { 'psantafe@losolivos.co': libre } });
    ldap.validarCredenciales.mockResolvedValue(AD_OK);

    const r = await identidadSvc.login({ usuario: 'psantafe', password: 'clave' });

    expect(vincularAdUsuario).toHaveBeenCalledWith(libre, 'psantafe');
    expect(r.identidad.ad_usuario).toBe('psantafe');
    const tags = console.log.mock.calls.map(([l]) => JSON.parse(l).tag);
    expect(tags).toContain('AUTH_AD_VINCULADO_AUTO');
  });

  test('cuenta del AD válida sin identidad: SIN_ACCESO', async () => {
    responderFindOne({});
    ldap.validarCredenciales.mockResolvedValue({ ...AD_OK, email: 'otro@x.co' });
    await expect(identidadSvc.login({ usuario: 'psantafe', password: 'clave' }))
      .rejects.toMatchObject({ code: 'SIN_ACCESO', message: 'Tu usuario de red no tiene acceso a GenFlow.' });
  });

  test('identidad inactiva: USER_INACTIVE', async () => {
    responderFindOne({ porAd: { psantafe: identidad({ activo: 0 }) } });
    ldap.validarCredenciales.mockResolvedValue(AD_OK);
    await expect(identidadSvc.login({ usuario: 'psantafe', password: 'clave' }))
      .rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });

  test('AD caído: AD_NO_DISPONIBLE', async () => {
    ldap.validarCredenciales.mockRejectedValue(errorAd('AD_NO_DISPONIBLE', 'No se pudo conectar al directorio activo: ECONNREFUSED'));
    await expect(identidadSvc.login({ usuario: 'psantafe', password: 'clave' }))
      .rejects.toMatchObject({ code: 'AD_NO_DISPONIBLE', message: 'No hay conexión con el directorio activo, intenta en unos minutos.' });
  });

  test('cuenta bloqueada: conserva el mensaje específico de ldap.service', async () => {
    ldap.validarCredenciales.mockRejectedValue(errorAd('CREDENCIALES_INVALIDAS', 'Tu cuenta está bloqueada en el directorio. Contacta a TI.'));
    await expect(identidadSvc.login({ usuario: 'psantafe', password: 'clave' }))
      .rejects.toMatchObject({ code: 'CREDENCIALES_INVALIDAS', message: 'Tu cuenta está bloqueada en el directorio. Contacta a TI.' });
  });

  test('usuario inexistente en el AD: mensaje genérico (no revela que no existe)', async () => {
    ldap.validarCredenciales.mockRejectedValue(errorAd('CREDENCIALES_INVALIDAS', 'Usuario no encontrado en el directorio'));
    await expect(identidadSvc.login({ usuario: 'fantasma', password: 'clave' }))
      .rejects.toMatchObject({ message: 'Usuario o contraseña incorrectos' });
  });

  test('vacíos: VALIDATION_ERROR', async () => {
    await expect(identidadSvc.login({ usuario: '  ', password: '' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Usuario y contraseña son requeridos' });
  });

  test('nunca lee password_hash', async () => {
    const i = identidad();
    let leido = false;
    Object.defineProperty(i, 'password_hash', { get() { leido = true; return 'hash'; } });
    responderFindOne({ porAd: { psantafe: i } });
    ldap.validarCredenciales.mockResolvedValue(AD_OK);
    await identidadSvc.login({ usuario: 'psantafe', password: 'clave' });
    expect(leido).toBe(false);
  });

  test('ya no exporta cambiarPassword', () => {
    expect(identidadSvc.cambiarPassword).toBeUndefined();
  });
});
