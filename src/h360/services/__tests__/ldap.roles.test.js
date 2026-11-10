// Asignación de roles de H360 por grupos del AD: comparación EXACTA (antes era por subcadena).
const { detectarRoles } = require('../ldap.service');

const GRUPOS_H360 = ['LDAP_GROUP_ADMIN', 'LDAP_GROUP_ASESOR', 'LDAP_GROUP_ASISTENTE', 'LDAP_GROUP_TANATOLOGO',
  'LDAP_GROUP_ASIST_TANATOLOGO', 'LDAP_GROUP_SUPERVISORA', 'LDAP_GROUP_COORDINADOR', 'LDAP_GROUP_CONTABILIDAD',
  'LDAP_GROUP_RECEPCION', 'LDAP_GROUP_TRAMITADOR'];
const dn = (cn, ou = 'Grupos') => `CN=${cn},OU=${ou},DC=olivos,DC=local`;

beforeEach(() => {
  for (const g of GRUPOS_H360) delete process.env[g];
  process.env.LDAP_GROUP_ADMIN = 'H360Admin';
  process.env.LDAP_GROUP_ASESOR = 'H360Asesor';
});

test('CN exacto da el rol, sin importar mayúsculas ni espacios alrededor', () => {
  expect(detectarRoles([dn('H360Admin')])).toEqual(['admin']);
  expect(detectarRoles(['cn = h360admin , ou=Grupos,dc=olivos,dc=local'])).toEqual(['admin']);
});

test('un grupo cuyo nombre CONTIENE el configurado no da el rol', () => {
  expect(detectarRoles([dn('H360AdminViejo')])).toEqual([]);
  expect(detectarRoles([dn('Ex-H360Admin')])).toEqual([]);
});

test('el nombre configurado en otra parte del DN (una OU) no da el rol', () => {
  expect(detectarRoles(['CN=Cualquiera,OU=H360Admin,DC=olivos,DC=local'])).toEqual([]);
});

test('con un DN completo configurado se compara el DN entero (no basta el CN en otra OU)', () => {
  process.env.LDAP_GROUP_ADMIN = 'CN=H360Admin,OU=Grupos,DC=olivos,DC=local';
  expect(detectarRoles([dn('H360Admin')])).toEqual(['admin']);
  expect(detectarRoles([dn('H360Admin', 'Pruebas')])).toEqual([]);
});

test('una coma escapada en el CN no corta la comparación', () => {
  process.env.LDAP_GROUP_ASESOR = 'Asesores\\, Norte';
  expect(detectarRoles(['CN=Asesores\\, Norte,OU=Grupos,DC=olivos,DC=local'])).toEqual(['asesor']);
  expect(detectarRoles(['CN=Asesores,OU=Grupos,DC=olivos,DC=local'])).toEqual([]);
});

test('respaldo de administradores del dominio: solo el grupo exacto', () => {
  delete process.env.LDAP_GROUP_ADMIN;
  delete process.env.LDAP_GROUP_ASESOR;
  expect(detectarRoles([dn('Domain Admins', 'Users')])).toEqual(['admin']);
  expect(detectarRoles([dn('Admins. del dominio', 'Users')])).toEqual(['admin']);
  expect(detectarRoles([dn('Ex Domain Admins Viejos')])).toEqual([]);
  expect(detectarRoles([dn('Copia de Admins. del dominio')])).toEqual([]);
});

test('el orden de prioridad se mantiene y un memberOf raro no rompe', () => {
  expect(detectarRoles([dn('H360Asesor'), dn('H360Admin')])).toEqual(['admin', 'asesor']);
  expect(detectarRoles([])).toEqual([]);
  expect(detectarRoles(['', null, 'basura'])).toEqual([]);
});
