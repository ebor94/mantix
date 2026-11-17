jest.mock('../src/h360/services/ldap.service', () => ({ listarUsuariosDirectorio: jest.fn() }));

const DIRECTORIO = [
  { usuario: 'PSANTAFE', nombre: 'PATRICIA SANTAFÉ', cn: 'x', mail: 'psantafe@losolivos.co' },
  { usuario: 'comana',   nombre: 'CAMILO OMAÑA',     cn: 'x', mail: '' },
  ...Array.from({ length: 30 }, (_, i) => ({ usuario: `asesor${i}`, nombre: `ASESOR ${i}`, cn: 'x', mail: '' }))
];

let ldap;
let directorio;
beforeEach(() => {
  jest.resetModules();
  ldap = require('../src/h360/services/ldap.service');
  ldap.listarUsuariosDirectorio.mockResolvedValue(DIRECTORIO);
  directorio = require('../src/sv/services/directorioAd.service');
});
afterEach(() => jest.restoreAllMocks());

test('exige mínimo 3 caracteres', async () => {
  await expect(directorio.buscar('ps')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(ldap.listarUsuariosDirectorio).not.toHaveBeenCalled();
});

test('busca sin distinguir mayúsculas ni tildes y devuelve solo usuario, nombre, mail', async () => {
  expect(await directorio.buscar('santafe')).toEqual([
    { usuario: 'PSANTAFE', nombre: 'PATRICIA SANTAFÉ', mail: 'psantafe@losolivos.co' }
  ]);
  expect((await directorio.buscar('omana')).map(u => u.usuario)).toEqual(['comana']);
});

test('tope de 20 resultados', async () => {
  expect(await directorio.buscar('asesor')).toHaveLength(20);
});

test('caché de 10 minutos', async () => {
  const ahora = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  await directorio.buscar('santafe');
  ahora.mockReturnValue(1_000_000 + 9 * 60 * 1000);
  await directorio.buscar('omana');
  expect(ldap.listarUsuariosDirectorio).toHaveBeenCalledTimes(1);
  ahora.mockReturnValue(1_000_000 + 11 * 60 * 1000);
  await directorio.buscar('omana');
  expect(ldap.listarUsuariosDirectorio).toHaveBeenCalledTimes(2);
});

test('AD caído → AD_NO_DISPONIBLE', async () => {
  ldap.listarUsuariosDirectorio.mockRejectedValue(new Error('ECONNREFUSED'));
  await expect(directorio.buscar('santafe')).rejects.toMatchObject({
    code: 'AD_NO_DISPONIBLE',
    message: 'No hay conexión con el directorio activo, intenta en unos minutos.'
  });
});
