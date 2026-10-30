// Placas B1…, ids 2900-2949.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEstado = require('../repositorios/estado');
const repoEventos = require('../repositorios/eventos');
const { crearH360Lectura } = require('../services/h360Lectura.service');

let conn;
let bd;
let tanqueo;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'B1%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2900 AND 2949`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2901, 'B1A', 'B1 A', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2901, 'B1P-001', 'Ford', 'F', 'CARROZA', 1), (2902, 'B1P002', 'Kia', 'K', 'CARROZA', 0)");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('la migración 005 está aplicada', async () => {
  const [[col]] = await conn.query(
    "SELECT IS_NULLABLE AS nula FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_estado_vehiculo' AND COLUMN_NAME = 'sembrado_at'",
  );
  expect(col).toEqual({ nula: 'YES' });
  const [[tipo]] = await conn.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_eventos' AND COLUMN_NAME = 'inconsistencia_tipo'",
  );
  expect(tipo.t).toContain("'SALIDA_OTRA_SEDE'");
  const [[accion]] = await conn.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_auditoria' AND COLUMN_NAME = 'accion'",
  );
  expect(accion.t).toContain("'SEMBRAR'");
});

test('sembrar crea la fila una sola vez y cuenta como estado', async () => {
  expect(await repoEstado.sembrar(conn, { placa: 'B1P001', sedeId: 2901 })).toBe(true);
  expect(await repoEstado.sembrar(conn, { placa: 'B1P001', sedeId: 2901 })).toBe(false);
  expect(await repoEstado.obtener(conn, 'B1P001')).toMatchObject({
    placa: 'B1P001', tipo_vehiculo: 'PROPIO', sede_id: 2901, dentro: 1, ultimo_evento_id: null,
    sembrado_at: expect.any(Date), desde: expect.any(Date),
  });
  await conn.beginTransaction();
  const bloqueada = await repoEstado.bloquear(conn, 'B1P001');
  await conn.commit();
  expect(bloqueada).toMatchObject({ sede_id: 2901, dentro: 1, sembrado_at: expect.any(Date) });
});

test('dentro de la sede incluye los sembrados como carga inicial', async () => {
  const ingreso = await repoEventos.insertar(conn, {
    sede_id: 2901, sentido: 'INGRESO', tipo_vehiculo: 'PROVEEDOR', placa: 'B1V001', motivo_id: tanqueo,
    conductor_nombre: 'Ana', conductor_otro: false, inconsistente: 0, registrado_por: 'g',
  });
  await repoEstado.bloquear(conn, 'B1V001');
  await repoEstado.guardar(conn, { placa: 'B1V001', tipo_vehiculo: 'PROVEEDOR', sede_id: 2901, dentro: 1, ultimo_evento_id: ingreso, salida_abierta_id: null });

  const dentro = (await repoEstado.dentroDeSede(conn, 2901)).filter((e) => e.placa.startsWith('B1'));
  expect(dentro.find((e) => e.placa === 'B1P001')).toEqual({
    id: null, placa: 'B1P001', tipo_vehiculo: 'PROPIO', sede_id: 2901, sentido: null, motivo: null,
    registrado_at: expect.any(Date), carga_inicial: true,
  });
  expect(dentro.find((e) => e.placa === 'B1V001')).toMatchObject({ id: ingreso, carga_inicial: false, motivo: { codigo: 'TANQUEO' } });
});

test('listarVehiculosPropios trae todos los activos, sin límite y normalizados', async () => {
  const h360 = crearH360Lectura(bd);
  const placas = (await h360.listarVehiculosPropios()).map((v) => v.placa);
  expect(placas).toContain('B1P001');
  expect(placas).not.toContain('B1P002');
});
