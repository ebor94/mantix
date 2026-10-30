// Primeras pruebas del servicio LDAP: ldapjs se reemplaza por clientes falsos (nada sale a la red).
const { EventEmitter } = require('events');

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));
const ldap = require('ldapjs');
const { validarCredenciales, autenticarLDAP } = require('../ldap.service');

const GRUPOS_H360 = ['LDAP_GROUP_ADMIN', 'LDAP_GROUP_ASESOR', 'LDAP_GROUP_ASISTENTE', 'LDAP_GROUP_TANATOLOGO',
  'LDAP_GROUP_ASIST_TANATOLOGO', 'LDAP_GROUP_SUPERVISORA', 'LDAP_GROUP_COORDINADOR', 'LDAP_GROUP_CONTABILIDAD',
  'LDAP_GROUP_RECEPCION', 'LDAP_GROUP_TRAMITADOR'];

const ENTRADA = {
  dn: 'CN=Juan Pérez,OU=Usuarios,DC=olivos,DC=local',
  attributes: [
    { type: 'sAMAccountName', values: ['jperez'] },
    { type: 'displayName', values: ['Juan Pérez'] },
    { type: 'mail', values: ['jperez@olivos.local'] },
    { type: 'memberOf', values: ['CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local'] },
  ],
};

function cliente({ bind = (dn, pw, cb) => cb(null), entradas = [] } = {}) {
  return {
    on: jest.fn(),
    destroy: jest.fn(),
    bind: jest.fn(bind),
    search: jest.fn((base, opciones, cb) => {
      const res = new EventEmitter();
      cb(null, res);
      process.nextTick(() => {
        entradas.forEach((e) => res.emit('searchEntry', e));
        res.emit('end');
      });
    }),
  };
}

/** Primer createClient = cuenta de servicio; segundo = re-bind del usuario. */
function directorio({ svc = cliente({ entradas: [ENTRADA] }), usuario = cliente() } = {}) {
  ldap.createClient.mockReset();
  ldap.createClient.mockReturnValueOnce(svc).mockReturnValueOnce(usuario);
  return { svc, usuario };
}

beforeAll(() => {
  Object.assign(process.env, {
    LDAP_URL: 'ldap://falso', LDAP_BASE_DN: 'DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'x',
  });
});
beforeEach(() => {
  for (const g of GRUPOS_H360) delete process.env[g];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('validarCredenciales', () => {
  test('credenciales válidas → datos y grupos, sin exigir rol de H360', async () => {
    const { usuario } = directorio();
    await expect(validarCredenciales('OLIVOS\\jperez', 'clave')).resolves.toEqual({
      usuario: 'jperez',
      nombre: 'Juan Pérez',
      email: 'jperez@olivos.local',
      memberOf: ['CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local'],
    });
    expect(usuario.bind).toHaveBeenCalledTimes(1);
    expect(usuario.bind).toHaveBeenCalledWith('CN=Juan Pérez,OU=Usuarios,DC=olivos,DC=local', 'clave', expect.any(Function));
  });

  test('contraseña incorrecta → CREDENCIALES_INVALIDAS con un solo bind del usuario', async () => {
    // Como lo produce ldapjs v3 para el código LDAP 49 (el módulo está mockeado: sin instanceof).
    const invalida = Object.assign(new Error('80090308: LdapErr: DSID-0C09044E, data 52e'), {
      name: 'InvalidCredentialsError', code: 49,
    });
    const { usuario } = directorio({ usuario: cliente({ bind: (dn, pw, cb) => cb(invalida) }) });
    await expect(validarCredenciales('jperez', 'mala')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos',
    });
    expect(usuario.bind).toHaveBeenCalledTimes(1);
  });

  test('error de red en el bind del usuario → AD_NO_DISPONIBLE', async () => {
    const { usuario } = directorio({ usuario: cliente({ bind: (dn, pw, cb) => cb(new Error('ECONNRESET')) }) });
    const err = await validarCredenciales('jperez', 'clave').catch((e) => e);
    expect(err.codigo).toBe('AD_NO_DISPONIBLE');
    expect(err.message).toMatch(/^No se pudo conectar al directorio activo/);
    expect(err.message).toContain('ECONNRESET');
    expect(usuario.bind).toHaveBeenCalledTimes(1);
  });

  test('usuario inexistente → CREDENCIALES_INVALIDAS', async () => {
    directorio({ svc: cliente({ entradas: [] }) });
    await expect(validarCredenciales('nadie', 'x')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario no encontrado en el directorio',
    });
  });

  test('contraseña vacía se rechaza sin consultar el directorio (evita el bind anónimo)', async () => {
    ldap.createClient.mockReset();
    await expect(validarCredenciales('jperez', '')).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(ldap.createClient).not.toHaveBeenCalled();
  });

  test('directorio caído → AD_NO_DISPONIBLE', async () => {
    directorio({ svc: cliente({ bind: (dn, pw, cb) => cb(new Error('connect ECONNREFUSED')) }) });
    const err = await validarCredenciales('jperez', 'clave').catch((e) => e);
    expect(err.codigo).toBe('AD_NO_DISPONIBLE');
    expect(err.message).toMatch(/^No se pudo conectar al directorio activo/);
  });
});

describe('autenticarLDAP (H360) conserva su comportamiento', () => {
  test('sin grupo de H360 sigue rechazando con el mismo mensaje', async () => {
    directorio();
    await expect(autenticarLDAP('jperez', 'clave'))
      .rejects.toThrow('Tu usuario no tiene rol asignado en Homenajes360. Contacta a TI.');
  });

  test('con grupo de H360 devuelve rol y roles', async () => {
    process.env.LDAP_GROUP_ASISTENTE = 'PorteriaGuardas';
    directorio();
    await expect(autenticarLDAP('jperez', 'clave')).resolves.toEqual({
      usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local', rol: 'asistente', roles: ['asistente'],
    });
  });
});
