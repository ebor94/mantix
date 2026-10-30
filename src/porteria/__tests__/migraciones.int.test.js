const { abrirConexion } = require('../testing/bd');
const { aplicarMigraciones } = require('../scripts/migrador');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });

test('las tres migraciones quedan registradas y un segundo intento no aplica nada', async () => {
  const [filas] = await conn.query('SELECT nombre FROM por_migraciones ORDER BY nombre');
  expect(filas.map((f) => f.nombre)).toEqual([
    '001_esquema.sql', '002_seed_motivos.sql', '003_vista_movimientos.sql',
  ]);
  expect(await aplicarMigraciones(conn)).toEqual([]);
});

test('el seed crea los 12 motivos con su configuración', async () => {
  const [motivos] = await conn.query(
    `SELECT codigo, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor,
            tipo_referencia, referencia_obligatoria
       FROM por_motivos ORDER BY orden`,
  );
  expect(motivos).toHaveLength(12);
  const porCodigo = Object.fromEntries(motivos.map((m) => [m.codigo, m]));
  expect(porCodigo.SERES_QUERIDOS).toMatchObject({ aplica_propio: 1, tipo_referencia: 'ASISTENCIA', referencia_obligatoria: 1 });
  expect(porCodigo.EXEQUIAS).toMatchObject({ tipo_referencia: 'EXEQUIA', referencia_obligatoria: 1 });
  expect(porCodigo.TANQUEO).toMatchObject({ tipo_referencia: 'NINGUNA', referencia_obligatoria: 0 });
  expect(porCodigo.SERES_QUERIDOS_TERCERIZADA).toMatchObject({
    aplica_propio: 0, aplica_proveedor_asistencia: 1, aplica_proveedor: 0, tipo_referencia: 'ASISTENCIA',
  });
  expect(porCodigo.OTRO).toMatchObject({
    aplica_propio: 0, aplica_proveedor_asistencia: 1, aplica_proveedor: 1, tipo_referencia: 'TEXTO', referencia_obligatoria: 1,
  });
});

test('la vista calcula duración y km del viaje con par y omite anulados', async () => {
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (901, 'S901', 'Sede vista', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (901, 'VIS901', 'Ford', 'X', 'CARROZA', 1)");
  const [[motivo]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
  const [salida] = await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, vehiculo_id, conductor_nombre, motivo_id,
                              kilometraje, registrado_at, registrado_por)
     VALUES (901, 'SALIDA', 'PROPIO', 'VIS901', 901, 'Juan', ?, 1000, '2026-10-30 08:00:00', 'guarda1')`, [motivo.id]);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, vehiculo_id, conductor_nombre, motivo_id,
                              kilometraje, evento_par_id, registrado_at, registrado_por)
     VALUES (901, 'INGRESO', 'PROPIO', 'VIS901', 901, 'Juan', ?, 1042, ?, '2026-10-30 09:30:00', 'guarda1')`,
    [motivo.id, salida.insertId]);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, conductor_nombre, motivo_id,
                              registrado_at, registrado_por, anulado)
     VALUES (901, 'SALIDA', 'PROPIO', 'VIS901', 'Juan', ?, '2026-10-30 10:00:00', 'guarda1', 1)`, [motivo.id]);

  const [filas] = await conn.query(
    "SELECT sentido, sede_nombre, motivo_codigo, duracion_min, km_recorridos FROM v_por_movimientos WHERE placa = 'VIS901' ORDER BY registrado_at",
  );
  expect(filas).toEqual([
    { sentido: 'SALIDA', sede_nombre: 'Sede vista', motivo_codigo: 'TANQUEO', duracion_min: null, km_recorridos: null },
    { sentido: 'INGRESO', sede_nombre: 'Sede vista', motivo_codigo: 'TANQUEO', duracion_min: 90, km_recorridos: 42 },
  ]);
});

test('por_estado_vehiculo tiene la placa como clave primaria', async () => {
  const [[pk]] = await conn.query(
    `SELECT GROUP_CONCAT(COLUMN_NAME) AS columnas FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_estado_vehiculo' AND CONSTRAINT_NAME = 'PRIMARY'`,
  );
  expect(pk.columnas).toBe('placa');
});
