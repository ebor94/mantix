// src/porteria/__tests__/auditoriaCatalogo.int.test.js
// Placas A43…, ids 3010-3029.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let externos;
let eventos;
let lavado;
let entrega;
const sesion = { usuario: 'guardaA43', nombre: 'A43', rol: 'guarda', sede_id: 3011, sede_nombre: 'A43' };
const ctx = { apiCodigo: 'POR-TST-043', ip: '10.0.0.43' };
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const auditoria = async (entidad, entidadId) => {
  const [filas] = await conn.query(
    'SELECT usuario, api_codigo, accion, antes, despues, ip FROM por_auditoria WHERE entidad = ? AND entidad_id = ? ORDER BY id',
    [entidad, entidadId],
  );
  return filas.map((f) => ({ ...f, antes: json(f.antes), despues: json(f.despues) }));
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'A43%'");
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'A43%'");
  await conn.query("DELETE FROM por_vehiculos_externos WHERE placa LIKE 'A43%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3010 AND 3029`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3011, 'A43S', 'A43', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3011, 'A43P001', 'F', 'F', 'CARROZA', 1)");
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  [[{ id: entrega }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'ENTREGA_MERCANCIA'");
  externos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: externos,
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('buscar con inactivos los incluye; sin la opción, no', async () => {
  const id = await externos.crear({ placa: 'A43X009', tipo: 'PROVEEDOR', empresa: 'Inactiva A43', usuario: 'guardaA43' }, null, ctx);
  await externos.actualizar(id, { activo: false }, 'adminA43', ctx);
  expect((await externos.buscar('A43X009')).map((v) => v.placa)).toEqual([]);
  expect((await externos.buscar('A43X009', { incluirInactivos: true })).map((v) => [v.placa, v.activo])).toEqual([['A43X009', false]]);
});

test('crear un vehículo de proveedor queda auditado', async () => {
  const id = await externos.crear({ placa: 'A43X001', tipo: 'PROVEEDOR', empresa: 'Flores', usuario: 'guardaA43' }, null, ctx);
  expect(await auditoria('vehiculo_externo', id)).toEqual([{
    usuario: 'guardaA43', api_codigo: 'POR-TST-043', accion: 'CREAR', antes: null, ip: '10.0.0.43',
    despues: expect.objectContaining({ id, placa: 'A43X001', empresa: 'Flores', activo: true }),
  }]);
});

test('editar audita antes y después; un id inexistente no audita', async () => {
  const id = await externos.crear({ placa: 'A43X002', tipo: 'PROVEEDOR', empresa: 'Vieja', usuario: 'guardaA43' }, null, ctx);
  expect(await externos.actualizar(id, { empresa: 'Nueva', activo: false }, 'adminA43', ctx)).toBe(true);
  const [, cambio] = await auditoria('vehiculo_externo', id);
  expect(cambio).toMatchObject({
    usuario: 'adminA43', accion: 'CORREGIR',
    antes: expect.objectContaining({ empresa: 'Vieja', activo: true }),
    despues: expect.objectContaining({ empresa: 'Nueva', activo: false }),
  });
  expect(await externos.actualizar(3029999, { empresa: 'X' }, 'adminA43', ctx)).toBe(false);
  expect(await auditoria('vehiculo_externo', 3029999)).toEqual([]);
});

test('guardar en el catálogo al registrar audita la creación con el código de la API', async () => {
  await eventos.registrar({
    sentido: 'INGRESO', placa: 'A43X003', tipo_vehiculo: 'PROVEEDOR', motivo_id: entrega, empresa: 'Mercancías',
    conductor_nombre: 'Luis', conductor_documento: '1090123', guardar_en_catalogo: true,
  }, sesion, { apiCodigo: 'POR-EVT-001', ip: '10.0.0.43' });
  const creado = await externos.obtenerPorPlaca('A43X003');
  expect(await auditoria('vehiculo_externo', creado.id)).toEqual([
    expect.objectContaining({ usuario: 'guardaA43', api_codigo: 'POR-EVT-001', accion: 'CREAR' }),
  ]);
});

test('anular una salida audita el ingreso al que se le quita el par', async () => {
  const datos = { placa: 'A43P001', motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro' };
  const salida = await eventos.registrar({ ...datos, sentido: 'SALIDA' }, sesion);
  const ingreso = await eventos.registrar({ ...datos, sentido: 'INGRESO' }, sesion);
  expect(ingreso.evento_par_id).toBe(salida.id);

  await eventos.anular(salida.id, { motivo: 'Error' }, sesion, { apiCodigo: 'POR-EVT-005', ip: '10.0.0.43' });

  const delIngreso = await auditoria('evento', ingreso.id);
  expect(delIngreso.map((a) => a.accion)).toEqual(['CREAR', 'CORREGIR']);
  expect(delIngreso[1]).toMatchObject({
    usuario: 'guardaA43', api_codigo: 'POR-EVT-005',
    antes: expect.objectContaining({ evento_par_id: salida.id }),
    despues: expect.objectContaining({ evento_par_id: null }),
  });
});
