// Primeras pruebas del servicio LDAP: ldapjs se reemplaza por clientes falsos (nada sale a la red).
const { EventEmitter } = require('events');

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));
const ldap = require('ldapjs');
const { validarCredenciales, autenticarLDAP, detectarRoles } = require('../ldap.service');

const GRUPOS_H360 = ['LDAP_GROUP_ADMIN', 'LDAP_GROUP_ASESOR', 'LDAP_GROUP_ASISTENTE', 'LDAP_GROUP_TANATOLOGO',
  'LDAP_GROUP_ASIST_TANATOLOGO', 'LDAP_GROUP_SUPERVISORA', 'LDAP_GROUP_COORDINADOR', 'LDAP_GROUP_CONTABILIDAD',
  'LDAP_GROUP_RECEPCION', 'LDAP_GROUP_PSICOLOGIA', 'LDAP_GROUP_TRAMITADOR'];

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
  jest.spyOn(console, 'warn').mockImplementation(() => {});
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
    // Sin userPrincipalName en el directorio, el DN sigue siendo el respaldo.
    expect(usuario.bind).toHaveBeenCalledWith('CN=Juan Pérez,OU=Usuarios,DC=olivos,DC=local', 'clave', expect.any(Function));
  });

  // Una Ñ en el nombre dejaba a la persona sin poder entrar: @ldapjs/dn
  // convierte "CAMILO OMAÑA" en "CAMILO OMA\c3\91A" al volver el DN a texto y
  // el directorio ya no lo reconoce, así que el bind falla con 52e, el mismo
  // código de una contraseña equivocada. Pasó en producción con nueve
  // apellidos. El UPN no es un DN, viaja intacto y por eso se usa.
  describe('la contraseña se verifica con el userPrincipalName', () => {
    const conUpn = (extra) => ({
      ...ENTRADA,
      ...extra,
      attributes: [...ENTRADA.attributes, { type: 'userPrincipalName', values: [extra.upn] }],
    });

    test('se usa el UPN y no el DN', async () => {
      const { usuario } = directorio({
        svc: cliente({ entradas: [conUpn({ upn: 'jperez@olivos.local' })] }),
      });
      await validarCredenciales('jperez', 'clave');
      expect(usuario.bind).toHaveBeenCalledWith('jperez@olivos.local', 'clave', expect.any(Function));
    });

    test('un apellido con Ñ ya no manda el DN escapado', async () => {
      const { usuario } = directorio({
        svc: cliente({ entradas: [conUpn({
          dn: 'CN=CAMILO OMA\\c3\\91A,OU=Usuarios,DC=olivos,DC=local',
          upn: 'CAMILOOMANA@olivos.local',
        })] }),
      });
      await validarCredenciales('CAMILOOMANA', 'clave');
      expect(usuario.bind).toHaveBeenCalledWith('CAMILOOMANA@olivos.local', 'clave', expect.any(Function));
      expect(usuario.bind).toHaveBeenCalledTimes(1);
    });

    // Hay tres cuentas donde el UPN no se deriva del sAMAccountName, así que
    // se lee del directorio en vez de armarlo pegando "@olivos.local".
    test('se respeta un UPN que no coincide con el sAMAccountName', async () => {
      const { usuario } = directorio({
        svc: cliente({ entradas: [conUpn({ upn: 'JORGECORTINA@olivos.local' })] }),
      });
      await validarCredenciales('JCORTINA', 'clave');
      expect(usuario.bind).toHaveBeenCalledWith('JORGECORTINA@olivos.local', 'clave', expect.any(Function));
    });
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

  // El AD mete la causa real dentro del error 49. Lo que sigue verifica que
  // deje de salir "usuario o contraseña incorrectos" cuando la contraseña no
  // es el problema, porque esa frase manda a la persona a reintentar algo que
  // nunca va a funcionar.
  describe('el error 49 del AD se traduce por su subcódigo', () => {
    const error49 = (data) => Object.assign(
      new Error(`80090308: LdapErr: DSID-0C09044E, comment: AcceptSecurityContext error, data ${data}, v4f7c`),
      { name: 'InvalidCredentialsError', code: 49 },
    );
    const fallar = (data) => {
      directorio({ usuario: cliente({ bind: (dn, pw, cb) => cb(error49(data)) }) });
      return validarCredenciales('jperez', 'clave').catch((e) => e);
    };

    test.each([
      ['773', 'Tienes que cambiar tu contraseña. Hazlo en un computador del dominio y vuelve a entrar.'],
      ['532', 'Tu contraseña venció. Cámbiala en un computador del dominio y vuelve a entrar.'],
      ['775', 'Tu cuenta está bloqueada en el directorio. Contacta a TI.'],
      ['533', 'Tu cuenta está deshabilitada en el directorio. Contacta a TI.'],
    ])('data %s → dice qué pasa de verdad', async (data, mensaje) => {
      await expect(fallar(data)).resolves.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', message: mensaje });
    });

    // 52e es el único que el AD usa para dos cosas —contraseña mala y usuario
    // inexistente—, así que ahí seguimos sin afinar: distinguirlas permitiría
    // averiguar qué cuentas existen.
    test.each(['52e', '525'])('data %s → se queda con el mensaje genérico', async (data) => {
      await expect(fallar(data)).resolves.toHaveProperty('message', 'Usuario o contraseña incorrectos');
    });

    test('un subcódigo que no conocemos no rompe el login', async () => {
      await expect(fallar('abcd')).resolves.toHaveProperty('message', 'Usuario o contraseña incorrectos');
    });

    test('el subcódigo queda en el log aunque la respuesta sea genérica', async () => {
      await fallar('52e');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('data 52e'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('jperez'));
    });

    test('al log nunca va la contraseña', async () => {
      await fallar('52e');
      for (const [linea] of console.log.mock.calls) expect(String(linea)).not.toContain('clave');
    });
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

describe('el rol de psicología sale de su grupo del directorio', () => {
  const DN_PSICOLOGIA = ['CN=Psicologia_360,OU=Grupos,DC=olivos,DC=local'];

  test('quien está en el grupo de psicología entra con ese rol', () => {
    process.env.LDAP_GROUP_PSICOLOGIA = 'Psicologia_360';
    expect(detectarRoles(DN_PSICOLOGIA)).toContain('psicologia');
  });

  // Sin la variable de entorno el grupo no entra al mapa y detectarRoles
  // devuelve []. Es el modo de falla que dejó a recepción sin poder entrar: el
  // rol existía en el código y nadie avisaba de que faltaba la variable.
  test('sin la variable de entorno el rol no existe', () => {
    delete process.env.LDAP_GROUP_PSICOLOGIA;
    expect(detectarRoles(DN_PSICOLOGIA)).not.toContain('psicologia');
  });

  // El tramitador va último a propósito en ROLES_POR_GRUPO. Psicología se
  // agrega antes que él, así que quien esté en los dos grupos entra con el rol
  // de más alcance y no con el de tramitador.
  test('no desplaza al tramitador del último lugar', () => {
    process.env.LDAP_GROUP_PSICOLOGIA = 'Psicologia_360';
    process.env.LDAP_GROUP_TRAMITADOR = 'Tramitador_360';
    const roles = detectarRoles([...DN_PSICOLOGIA, 'CN=Tramitador_360,OU=Grupos,DC=olivos,DC=local']);
    // Sin esto, un rol ausente (indexOf = -1) pasaría la comparación de abajo.
    expect(roles).toEqual(expect.arrayContaining(['psicologia', 'tramitador']));
    expect(roles.indexOf('psicologia')).toBeLessThan(roles.indexOf('tramitador'));
  });
});
