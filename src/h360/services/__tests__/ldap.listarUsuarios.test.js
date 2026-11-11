// listarUsuariosDirectorio: búsqueda paginada de solo lectura (AD simulado).
const { EventEmitter } = require('events');

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));
const ldap = require('ldapjs');
const { listarUsuariosDirectorio } = require('../ldap.service');

const attr = (type, v) => ({ type, values: [v] });

test('pide paginado, solo usuarios activos, mapea sAMAccountName/displayName/cn/mail y cierra la conexión', async () => {
  let opciones;
  const cliente = {
    on: jest.fn(), destroy: jest.fn(),
    bind: jest.fn((dn, pw, cb) => cb(null)),
    search: jest.fn((base, opts, cb) => {
      opciones = { base, ...opts };
      const res = new EventEmitter(); cb(null, res);
      process.nextTick(() => {
        res.emit('searchEntry', { attributes: [attr('sAMAccountName', 'SILVANAMEJIA'), attr('cn', 'SILVANA MEJIA')] });
        res.emit('searchEntry', { attributes: [attr('sAMAccountName', 'williamleal'), attr('displayName', 'William Leal'), attr('mail', 'wl@losolivos.co')] });
        res.emit('searchEntry', { attributes: [attr('cn', 'sin cuenta')] });
        res.emit('end');
      });
    }),
  };
  ldap.createClient.mockReturnValue(cliente);
  Object.assign(process.env, { LDAP_URL: 'ldap://falso', LDAP_BASE_DN: 'OU=Usuarios,DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'x' });

  await expect(listarUsuariosDirectorio()).resolves.toEqual([
    { usuario: 'SILVANAMEJIA', nombre: '', cn: 'SILVANA MEJIA', mail: '' },
    { usuario: 'williamleal', nombre: 'William Leal', cn: '', mail: 'wl@losolivos.co' },
  ]);
  expect(opciones).toMatchObject({ base: 'DC=olivos,DC=local', scope: 'sub', paged: { pageSize: 500 } });
  expect(opciones.filter).toMatch(/userAccountControl:1\.2\.840\.113556\.1\.4\.803:=2/); // excluye deshabilitados
  expect(cliente.destroy).toHaveBeenCalled();
});
