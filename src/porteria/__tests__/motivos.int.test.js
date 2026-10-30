// src/porteria/__tests__/motivos.int.test.js
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearRepositorioMotivos } = require('../repositorios/motivos');

let conn;
let bd;
let motivos;
const codigos = (lista) => lista.map((m) => m.codigo);

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  motivos = crearRepositorioMotivos(bd);
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('filtra por tipo de vehículo y sentido, en orden', async () => {
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROPIO', sentido: 'INGRESO' }))).toEqual([
    'SERES_QUERIDOS', 'EXEQUIAS', 'TRASLADOS', 'RECOGIDA_COFRES', 'EQUIPOS_VELACION', 'TANQUEO', 'LAVADO', 'MANTENIMIENTO',
  ]);
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR' })))
    .toEqual(['ENTREGA_MERCANCIA', 'MANTENIMIENTO_SERVICIO', 'OTRO']);
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR_ASISTENCIA', sentido: 'SALIDA' })))
    .toEqual(['SERES_QUERIDOS_TERCERIZADA', 'OTRO']);
});

test('devuelve la referencia que exige cada motivo', async () => {
  const [otro] = (await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR' })).filter((m) => m.codigo === 'OTRO');
  expect(otro).toMatchObject({ nombre: 'Otro', tipo_referencia: 'TEXTO', referencia_obligatoria: true });
  expect(Object.keys(otro).sort()).toEqual(['codigo', 'descripcion', 'id', 'nombre', 'referencia_obligatoria', 'tipo_referencia']);
});

test('omite los inactivos', async () => {
  await conn.query("UPDATE por_motivos SET activo = 0 WHERE codigo = 'LAVADO'");
  try {
    expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROPIO' }))).not.toContain('LAVADO');
  } finally {
    await conn.query("UPDATE por_motivos SET activo = 1 WHERE codigo = 'LAVADO'");
  }
});

test('un tipo o sentido desconocido es un error de programación', async () => {
  await expect(motivos.listarActivos({ tipoVehiculo: 'CAMION' })).rejects.toThrow('Tipo de vehículo inválido');
  await expect(motivos.listarActivos({ sentido: 'ARRIBA' })).rejects.toThrow('Sentido inválido');
});
