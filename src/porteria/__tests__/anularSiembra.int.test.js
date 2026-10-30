// src/porteria/__tests__/anularSiembra.int.test.js
// Placas B4…, ids 2990-2999.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEstado = require('../repositorios/estado');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
let lavado;
const sede = { usuario: 'guardaB4', nombre: 'B4', rol: 'guarda', sede_id: 2991, sede_nombre: 'B4' };
const salida = (placa) => ({ sentido: 'SALIDA', placa, motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro' });

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'B4%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2990 AND 2999`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2991, 'B4S', 'B4', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2991, 'B4P001', 'F', 'F', 'CARROZA', 1), (2992, 'B4P002', 'F', 'F', 'CARROZA', 1)");
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

test('anular la salida de un sembrado lo devuelve a su siembra', async () => {
  await repoEstado.sembrar(conn, { placa: 'B4P001', sedeId: 2991 });
  const ev = await eventos.registrar(salida('B4P001'), sede);
  expect(await repoEstado.obtener(conn, 'B4P001')).toMatchObject({ dentro: 0, ultimo_evento_id: ev.id });

  await eventos.anular(ev.id, { motivo: 'Error de digitación' }, sede);

  expect(await repoEstado.obtener(conn, 'B4P001')).toMatchObject({
    tipo_vehiculo: 'PROPIO', sede_id: 2991, dentro: 1, ultimo_evento_id: null, salida_abierta_id: null, sembrado_at: expect.any(Date),
  });
  const dentro = await repoEstado.dentroDeSede(conn, 2991);
  expect(dentro.find((e) => e.placa === 'B4P001')).toMatchObject({ id: null, carga_inicial: true, sede_id: 2991 });
});

test('anular el único evento de un no sembrado borra su estado', async () => {
  const ev = await eventos.registrar(salida('B4P002'), sede);
  await eventos.anular(ev.id, { motivo: 'Error' }, sede);
  expect(await repoEstado.obtener(conn, 'B4P002')).toBeNull();
  const [filas] = await conn.query("SELECT 1 FROM por_estado_vehiculo WHERE placa = 'B4P002'");
  expect(filas).toEqual([]);
});
