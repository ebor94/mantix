// src/porteria/__tests__/otraSede.int.test.js
// Placas B2…, ids 2950-2969.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEstado = require('../repositorios/estado');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let eventos;
let estado;
let lavado;
const sedeA = { usuario: 'guardaA', nombre: 'A', rol: 'guarda', sede_id: 2951, sede_nombre: 'A' };
const sedeB = { usuario: 'guardaB', nombre: 'B', rol: 'guarda', sede_id: 2952, sede_nombre: 'B' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const salida = (placa, extra = {}) => ({ sentido: 'SALIDA', placa, motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro', ...extra });

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa IN ('B2P051', 'B2P052', 'B2P053', 'B2P054', 'B2P055', 'B2V056')`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2950 AND 2969`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2951, 'B2SA', 'A', 'Cúcuta', 1), (2952, 'B2SB', 'B', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2951, 'B2P051', 'F', 'F', 'CARROZA', 1), (2952, 'B2P052', 'F', 'F', 'CARROZA', 1), (2953, 'B2P053', 'F', 'F', 'CARROZA', 1), (2954, 'B2P054', 'F', 'F', 'CARROZA', 1), (2955, 'B2P055', 'F', 'F', 'CARROZA', 1)");
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  const h360 = crearH360Lectura(bd);
  const vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({ bd, h360, conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos });
  estado = crearServicioEstado({ bd, h360, vehiculosExternos });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('un propio sembrado en A: salir por A es normal; ingresar estando dentro es incoherente', async () => {
  await repoEstado.sembrar(conn, { placa: 'B2P051', sedeId: 2951 });
  expect(await estado.sugerir('B2P051')).toMatchObject({
    sentido_sugerido: 'SALIDA', estado: { dentro: true, sede_id: 2951, desde: expect.any(Date), sembrado: true },
  });
  const err = await errorDe(eventos.registrar({ ...salida('B2P051'), sentido: 'INGRESO' }, sedeA));
  expect(err).toMatchObject({ statusCode: 409, errors: { estado: { dentro: true, sede_id: 2951, sin_historial: false, otra_sede: false, desde: expect.any(Date) } } });
  const ev = await eventos.registrar(salida('B2P051'), sedeA);
  expect(ev).toMatchObject({ inconsistente: false, sede_id: 2951 });
  expect((await estado.sugerir('B2P051')).estado).toMatchObject({ dentro: false, sembrado: false });
});

test('salir por B estando dentro de A: 409 otra sede; forzado queda SALIDA_OTRA_SEDE', async () => {
  await repoEstado.sembrar(conn, { placa: 'B2P052', sedeId: 2951 });
  const err = await errorDe(eventos.registrar(salida('B2P052'), sedeB));
  expect(err).toMatchObject({
    statusCode: 409, motivo: 'SENTIDO_INCOHERENTE',
    message: 'Este vehículo figura dentro de otra sede. Para registrar la salida igual, confírmalo y escribe una observación.',
    errors: { estado: { dentro: true, sede_id: 2951, otra_sede: true } },
  });
  const ev = await eventos.registrar(salida('B2P052', { forzar: true, observaciones: 'Lo movieron sin registrar' }), sedeB);
  expect(ev).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'SALIDA_OTRA_SEDE', sede_id: 2952 });
  // La salida forzada deja al vehículo fuera, por B; su siguiente ingreso por B la cierra.
  expect((await estado.sugerir('B2P052')).estado).toMatchObject({ dentro: false, sede_id: 2952 });
  const ingreso = await eventos.registrar({ ...salida('B2P052'), sentido: 'INGRESO' }, sedeB);
  expect(ingreso).toMatchObject({ inconsistente: false, evento_par_id: ev.id });
});

test('ingresar por B un vehículo que figura dentro de A: 409 con otra_sede', async () => {
  await repoEstado.sembrar(conn, { placa: 'B2P054', sedeId: 2951 });
  const err = await errorDe(eventos.registrar({ ...salida('B2P054'), sentido: 'INGRESO' }, sedeB));
  expect(err).toMatchObject({ statusCode: 409, errors: { estado: { dentro: true, sede_id: 2951, otra_sede: true } } });
});

test('un proveedor que entra por A y sale por B: 409 otra_sede', async () => {
  const [[{ id: entrega }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'ENTREGA_MERCANCIA'");
  const proveedor = { sentido: 'INGRESO', placa: 'B2V056', tipo_vehiculo: 'PROVEEDOR', motivo_id: entrega, conductor_nombre: 'Luis', conductor_documento: '1', empresa: 'Acme' };
  await eventos.registrar(proveedor, sedeA);
  const err = await errorDe(eventos.registrar({ ...proveedor, sentido: 'SALIDA' }, sedeB));
  expect(err).toMatchObject({ statusCode: 409, errors: { estado: { dentro: true, sede_id: 2951, otra_sede: true } } });
});

test('un propio sin historial ni siembra sale por cualquier sede sin marca', async () => {
  const ev = await eventos.registrar(salida('B2P053'), sedeB);
  expect(ev).toMatchObject({ inconsistente: false, inconsistencia_tipo: null });
});

test('tras un ingreso por B, salir por A es otra sede', async () => {
  await eventos.registrar({ ...salida('B2P053'), sentido: 'INGRESO' }, sedeB);
  expect(await errorDe(eventos.registrar(salida('B2P053'), sedeA))).toMatchObject({ statusCode: 409, errors: { estado: { otra_sede: true, sede_id: 2952 } } });
  expect(await eventos.registrar(salida('B2P053'), sedeB)).toMatchObject({ inconsistente: false });
});
