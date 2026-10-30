// Placas B3S…, ids 2970-2989.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearServicioSiembra } = require('../services/siembra.service');

let conn;
let bd;
let siembra;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'B3S%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2970 AND 2989`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2971, 'B3S', 'B3S', 'Cúcuta', 1), (2972, 'B3SX', 'Cerrada', 'Cúcuta', 0)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2971, 'B3S-001', 'F', 'F', 'CARROZA', 1), (2972, 'B3S002', 'F', 'F', 'CARROZA', 1), (2973, 'B3S003', 'F', 'F', 'CARROZA', 0), (2974, '--', 'F', 'F', 'CARROZA', 1)");
  siembra = crearServicioSiembra({ bd, h360: crearH360Lectura(bd) });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('con placas: siembra las pedidas y reporta las que no son propios activos', async () => {
  const r = await siembra.sembrarPropios({ sedeId: 2971, placas: ['B3S001', 'B3S003', 'B3S999'], usuario: 'carga-inicial' });
  expect(r.sembrados).toEqual(['B3S001']);
  expect(r.omitidos).toEqual([
    { placa: 'B3S003', razon: 'no es un vehículo activo de la empresa' },
    { placa: 'B3S999', razon: 'no es un vehículo activo de la empresa' },
  ]);
  const [[fila]] = await conn.query("SELECT * FROM por_estado_vehiculo WHERE placa = 'B3S001'");
  expect(fila).toMatchObject({ tipo_vehiculo: 'PROPIO', sede_id: 2971, dentro: 1, ultimo_evento_id: null });
  const [[aud]] = await conn.query("SELECT * FROM por_auditoria WHERE accion = 'SEMBRAR' AND entidad = 'vehiculo' AND entidad_id = 2971 ORDER BY id DESC LIMIT 1");
  expect(aud).toMatchObject({ usuario: 'carga-inicial' });
  expect(aud.despues).toEqual({ placa: 'B3S001', sede_id: 2971 });
});

test('sin placas: siembra todos los propios activos sin estado y nunca pisa uno existente', async () => {
  const r = await siembra.sembrarPropios({ sedeId: 2971, usuario: 'carga-inicial' });
  expect(r.sembrados).toContain('B3S002');
  expect(r.sembrados).not.toContain('B3S001');
  expect(r.omitidos).toContainEqual({ placa: 'B3S001', razon: 'ya tiene estado' });
  const otra = await siembra.sembrarPropios({ sedeId: 2971, placas: ['B3S002'], usuario: 'x' });
  expect(otra).toEqual({ sembrados: [], omitidos: [{ placa: 'B3S002', razon: 'ya tiene estado' }] });
});

test('placas de H360 vacías al normalizar o de más de 20 caracteres no se siembran', async () => {
  // vehiculos.placa es VARCHAR(20) en la base de pruebas: la de 21 caracteres solo puede llegar por el lector de H360.
  const larga = 'B3S012345678901234567';
  expect(larga).toHaveLength(21);
  const h360 = crearH360Lectura(bd);
  const listar = h360.listarVehiculosPropios.bind(h360);
  const servicio = crearServicioSiembra({
    bd,
    h360: { ...h360, listarVehiculosPropios: async () => [...(await listar()), { id: 2975, placa: larga }] },
  });
  const r = await servicio.sembrarPropios({ sedeId: 2971, placas: null, usuario: 'carga-inicial' });
  expect(r.omitidos).toContainEqual({ placa: larga, razon: 'placa inválida en H360' });
  expect(r.omitidos).toContainEqual({ placa: '', razon: 'placa inválida en H360' });
  expect(r.sembrados).not.toContain(larga);
  const [filas] = await conn.query("SELECT placa FROM por_estado_vehiculo WHERE placa = '' OR placa LIKE 'B3S0123%'");
  expect(filas).toEqual([]);
});

test('sede inexistente o inactiva → 404', async () => {
  await expect(siembra.sembrarPropios({ sedeId: 2972, usuario: 'x' }))
    .rejects.toMatchObject({ statusCode: 404, motivo: 'SEDE_NO_ENCONTRADA', message: 'La sede no existe o está inactiva' });
});
