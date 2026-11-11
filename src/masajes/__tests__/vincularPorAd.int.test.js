// Script de vinculación masiva contra la BD de prueba (el AD va simulado).
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario } = require('../testing/fabricas');
const { main } = require('../scripts/vincularPorAd');

let conn; let bd;
beforeAll(async () => { conn = await abrirConexion(); bd = crearBdDePrueba(); });
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  await limpiar(conn);
  await insertarBeneficiario(conn, { nombre: 'William Antonio Leal Castañeda', correo: 'wileca@hotmail.com' });
  await insertarBeneficiario(conn, { nombre: 'Juan Carlos Gomez', correo: null });
  await insertarBeneficiario(conn, { nombre: 'Pedro Inactivo Ruiz', correo: null, activo: 0 });
  await insertarBeneficiario(conn, { nombre: 'Edwin Ortega', correo: 'eortega@losolivos.co', ad_usuario: 'eortega' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const AD = async () => [
  { usuario: 'WILLIAMLEAL', nombre: 'William Leal' },
  { usuario: 'jgomez', nombre: 'Juan Gomez' }, { usuario: 'jgomez2', nombre: 'Juan Gómez' },
  { usuario: 'pruiz', nombre: 'Pedro Ruiz' },
];
const vinculos = async () => (await conn.query('SELECT nombre, ad_usuario FROM msj_beneficiarios ORDER BY id'))[0].map((r) => r.ad_usuario);

test('sin --aplicar no escribe nada', async () => {
  await expect(main(['--actor', 'admin1'], { bd, listarUsuarios: AD })).resolves.toBe(0);
  expect(await vinculos()).toEqual([null, null, null, 'eortega']);
});

test('--aplicar vincula solo lo seguro, en minúsculas, con historial "vinculacion" y el actor', async () => {
  await expect(main(['--actor', 'admin1', '--aplicar'], { bd, listarUsuarios: AD })).resolves.toBe(0);
  expect(await vinculos()).toEqual(['williamleal', null, null, 'eortega']); // homónimo e inactivo: a mano
  const [h] = await conn.query("SELECT accion, motivo, usuario FROM msj_cita_historial WHERE accion = 'vinculacion'");
  expect(h).toEqual([{ accion: 'vinculacion', motivo: 'williamleal', usuario: 'admin1' }]);
});
