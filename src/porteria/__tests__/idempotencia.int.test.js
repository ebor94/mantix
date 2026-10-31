// src/porteria/__tests__/idempotencia.int.test.js
// Placas A41…, ids 3000-3009.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
let lavado;
const sesion = { usuario: 'guardaA41', nombre: 'A41', rol: 'guarda', sede_id: 3001, sede_nombre: 'A41' };
const otro = { ...sesion, usuario: 'guardaA41b' };
const salida = (placa, clave) => ({
  sentido: 'SALIDA', placa, motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro', clave_cliente: clave,
});
const contar = async (placa) => (await conn.query('SELECT COUNT(*) AS n FROM por_eventos WHERE placa = ?', [placa]))[0][0].n;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'A41%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3000 AND 3009`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3001, 'A41S', 'A41', 'Cúcuta', 1)");
  await conn.query(
    "INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3001, 'A41P001', 'F', 'F', 'CARROZA', 1), (3002, 'A41P002', 'F', 'F', 'CARROZA', 1), (3003, 'A41P003', 'F', 'F', 'CARROZA', 1)",
  );
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('reintentar con la misma clave devuelve el mismo evento (aunque el sentido ya no sea coherente)', async () => {
  const clave = 'a41-0000-0000-0001';
  const primero = await eventos.registrar(salida('A41P001', clave), sesion);
  // El vehículo ya figura fuera: sin la clave, una segunda salida sería SENTIDO_INCOHERENTE.
  const segundo = await eventos.registrar(salida('A41P001', clave), sesion);
  expect(segundo.id).toBe(primero.id);
  expect(await contar('A41P001')).toBe(1);
});

test('dos envíos simultáneos con la misma clave crean un solo evento', async () => {
  const clave = 'a41-0000-0000-0002';
  const [a, b] = await Promise.all([
    eventos.registrar(salida('A41P002', clave), sesion),
    eventos.registrar(salida('A41P002', clave), sesion),
  ]);
  expect(a.id).toBe(b.id);
  expect(await contar('A41P002')).toBe(1);
});

test('la clave es por usuario y sin clave no hay deduplicación', async () => {
  const clave = 'a41-0000-0000-0003';
  await eventos.registrar(salida('A41P003', clave), sesion);
  const error = await eventos.registrar(salida('A41P003', clave), otro).then(() => null, (e) => e);
  expect(error).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE' });
  const [[fila]] = await conn.query("SELECT clave_cliente FROM por_eventos WHERE placa = 'A41P003'");
  expect(fila.clave_cliente).toBe(clave);
});
