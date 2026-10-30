// src/porteria/__tests__/estado.int.test.js
// Placas S7…, ids 2701-2799.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let eventos;
let estado;
let vehiculosExternos;
const m = {};
const sesion = { usuario: 'guarda1', nombre: 'G', rol: 'guarda', sede_id: 2701, sede_nombre: 'S7' };

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'S7%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2700 AND 2799`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2701, 'S7', 'S7', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2701, 'S7P-001', 'Ford', 'F', 'CARROZA', 1)");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;
  const h360 = crearH360Lectura(bd);
  vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta: true }) };
  eventos = crearServicioEventos({ bd, h360, conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos });
  estado = crearServicioEstado({ bd, h360, vehiculosExternos });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('propio sin historial: sugiere salida', async () => {
  expect(await estado.sugerir('s7p 001')).toMatchObject({
    placa: 'S7P001', tipo_vehiculo: 'PROPIO', vehiculo: { id: 2701, placa: 'S7P001' }, vehiculo_externo: null,
    estado: null, sentido_sugerido: 'SALIDA', propuesta: null,
  });
});

test('propio fuera: sugiere ingreso y propone lo de su salida', async () => {
  await eventos.registrar({ sentido: 'SALIDA', placa: 'S7P001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez' }, sesion);
  const s = await estado.sugerir('S7P001');
  expect(s).toMatchObject({
    sentido_sugerido: 'INGRESO',
    estado: { dentro: false, sede_id: 2701, desde: expect.any(Date) },
    propuesta: { motivo: { codigo: 'TANQUEO' }, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_otro: false },
  });
});

test('proveedor desconocido o del catálogo', async () => {
  expect(await estado.sugerir('S7V999')).toMatchObject({ tipo_vehiculo: null, sentido_sugerido: 'INGRESO', estado: null, propuesta: null });
  await vehiculosExternos.crear({ placa: 'S7V001', tipo: 'PROVEEDOR', empresa: 'Cofres SA', usuario: 'x' });
  expect(await estado.sugerir('S7V001')).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', vehiculo_externo: { empresa: 'Cofres SA' } });
});

test('dentro de la sede y propios fuera', async () => {
  await eventos.registrar({ sentido: 'INGRESO', placa: 'S7V001', motivo_id: m.ENTREGA_MERCANCIA, conductor_nombre: 'Y', conductor_documento: '1' }, sesion);
  const dentro = await estado.dentro(2701);
  expect(dentro.map((e) => e.placa)).toContain('S7V001');
  expect(dentro.find((e) => e.placa === 'S7V001')).toMatchObject({ motivo: { codigo: 'ENTREGA_MERCANCIA' }, empresa: 'Cofres SA' });
  expect((await estado.fuera(2701)).map((e) => e.placa)).toEqual(expect.arrayContaining(['S7P001']));
  expect((await estado.fuera(2701)).map((e) => e.placa)).not.toContain('S7V001');
  expect((await estado.fuera(null)).map((e) => e.placa)).toContain('S7P001');
});

test('placa vacía → 400', async () => {
  await expect(estado.sugerir(' - ')).rejects.toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message: 'Indica la placa' });
});
