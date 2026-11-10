// Diagnóstico de impacto de la corrección de roles: AD simulado (nada sale a la red).
const { EventEmitter } = require('events');

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));
const ldap = require('ldapjs');
const { diagnosticarRolesPorSubcadena } = require('../ldap.service');

const G = (cn, ou = 'Grupos') => `CN=${cn},OU=${ou},DC=olivos,DC=local`;
const usuario = (sam) => ({ attributes: [{ type: 'sAMAccountName', values: [sam] }] });
// grupos del directorio y sus miembros
const DIRECTORIO = {
  [G('H360Admin')]: ['ana'],
  [G('H360AdminViejo')]: ['ana', 'luis'], // ana sigue siendo admin por el grupo exacto; luis lo pierde
  [G('Domain Admins', 'Users')]: ['root1'],
};

function clienteFalso() {
  return {
    on: jest.fn(),
    destroy: jest.fn(),
    bind: jest.fn((dn, pw, cb) => cb(null)),
    search: jest.fn((base, { filter }, cb) => {
      const res = new EventEmitter();
      cb(null, res);
      let entradas = [];
      const grupo = /\(objectClass=group\)\(cn=\*(.+)\*\)/.exec(filter);
      const miembros = /\(memberOf=(.+)\)\)$/.exec(filter);
      if (grupo) entradas = Object.keys(DIRECTORIO).filter((dn) => dn.split(',')[0].includes(grupo[1])).map((dn) => ({ dn, attributes: [] }));
      else if (miembros) entradas = (DIRECTORIO[miembros[1]] || []).map(usuario);
      process.nextTick(() => { entradas.forEach((e) => res.emit('searchEntry', e)); res.emit('end'); });
    }),
  };
}

beforeAll(() => {
  Object.assign(process.env, { LDAP_URL: 'ldap://falso', LDAP_BASE_DN: 'OU=Usuarios,DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'x' });
  for (const k of Object.keys(process.env)) if (k.startsWith('LDAP_GROUP_')) delete process.env[k];
  process.env.LDAP_GROUP_ADMIN = 'H360Admin';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

test('lista solo a quien tenía el rol por un grupo parecido y no está en el exacto', async () => {
  ldap.createClient.mockReturnValue(clienteFalso());
  await expect(diagnosticarRolesPorSubcadena()).resolves.toEqual([
    { rol: 'admin', grupo: 'H360Admin', grupoParecido: G('H360AdminViejo'), usuarios: ['luis'] },
  ]);
});

test('los grupos exactos (incluido Domain Admins) no aparecen como cambio', async () => {
  ldap.createClient.mockReturnValue(clienteFalso());
  const r = await diagnosticarRolesPorSubcadena();
  expect(r.some((x) => x.usuarios.includes('ana') || x.usuarios.includes('root1'))).toBe(false);
});
