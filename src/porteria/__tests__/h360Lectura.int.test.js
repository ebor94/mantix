// src/porteria/__tests__/h360Lectura.int.test.js
// Datos propios con ids 1101-1199 (otras pruebas usan otros rangos sobre la misma base).
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');

let conn;
let bd;
let h360;
const propios = (filas) => filas.filter((f) => f.id >= 1100 && f.id < 1200);

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  h360 = crearH360Lectura(bd);
  for (const tabla of ['exequias', 'asistencias', 'vehiculos', 'sedes']) {
    await conn.query(`DELETE FROM ${tabla} WHERE id BETWEEN 1100 AND 1199`);
  }
  await conn.query(`INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES
    (1101, 'S1101', 'Sede Norte', 'Cúcuta', 1), (1102, 'S1102', 'Sede Cerrada', 'Cúcuta', 0)`);
  await conn.query(`INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES
    (1101, 'abc-110', 'Ford', 'F1', 'CARROZA', 1),
    (1102, 'XYZ 110', 'Kia', 'K2', 'CARROZA', 1),
    (1103, 'OFF110', 'Kia', 'K3', 'CARROZA', 0)`);
  await conn.query(`INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado, created_at) VALUES
    (1101, 'H360-2026-1101', 'María Gómez', 'C-77', 'NUEVO', '2026-10-30 08:00:00'),
    (1102, 'H360-2026-1102', 'Pedro Ruiz', 'C-78', 'ASISTENCIA', '2026-10-30 09:00:00'),
    (1103, 'H360-2026-1103', 'Ana Cerrada', 'C-79', 'CERRADO', '2026-10-30 10:00:00')`);
  await conn.query(`INSERT INTO exequias (id, asistencia_id, tipo, fecha, hora, lugar, vehiculo_id, estado) VALUES
    (1101, 1101, 'Misa', CURDATE(), '10:00:00', 'Parroquia A', 1102, 'PROGRAMADA'),
    (1102, 1102, 'Cremación', CURDATE() + INTERVAL 1 DAY, '08:00:00', 'Crematorio', 1101, 'PENDIENTE_VEHICULO'),
    (1103, 1101, 'Misa', CURDATE() - INTERVAL 1 DAY, '15:00:00', 'Parroquia B', NULL, 'PENDIENTE_CONFIRMAR'),
    (1104, 1102, 'Misa', CURDATE(), '11:00:00', 'Parroquia C', 1101, 'REALIZADA'),
    (1105, 1102, 'Misa', CURDATE() + INTERVAL 2 DAY, '09:00:00', 'Parroquia D', 1101, 'PROGRAMADA')`);
});

afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('sedes: solo activas', async () => {
  const ids = (await h360.listarSedes()).map((s) => s.id);
  expect(ids).toContain(1101);
  expect(ids).not.toContain(1102);
  expect(await h360.obtenerSede(1101)).toEqual({ id: 1101, codigo: 'S1101', nombre: 'Sede Norte', ciudad: 'Cúcuta' });
  expect(await h360.obtenerSede(1102)).toBeNull();
});

test('vehículos propios: búsqueda por placa normalizada, solo activos', async () => {
  expect(propios(await h360.buscarVehiculosPropios('abc 11'))).toEqual([
    { id: 1101, placa: 'ABC110', marca: 'Ford', modelo: 'F1', tipo: 'CARROZA' },
  ]);
  expect(propios(await h360.buscarVehiculosPropios('off'))).toEqual([]);
  expect(await h360.obtenerVehiculoPropioPorPlaca('xyz-110')).toEqual(
    { id: 1102, placa: 'XYZ110', marca: 'Kia', modelo: 'K2', tipo: 'CARROZA' },
  );
  expect(await h360.obtenerVehiculoPropioPorPlaca('OFF110')).toBeNull();
});

test('una placa que normaliza a vacío no lista ni encuentra nada', async () => {
  expect(await h360.buscarVehiculosPropios('-')).toEqual([]);
  expect(await h360.buscarVehiculosPropios('  ')).toEqual([]);
  expect(await h360.obtenerVehiculoPropioPorPlaca('-')).toBeNull();
  expect(await h360.obtenerVehiculoPropioPorPlaca('')).toBeNull();
  expect(propios(await h360.buscarVehiculosPropios())).toHaveLength(2);
});

test('asistencias: solo NUEVO y ASISTENCIA, recientes primero', async () => {
  expect(propios(await h360.buscarAsistencias('C-7')).map((a) => a.id)).toEqual([1102, 1101]);
  expect(propios(await h360.buscarAsistencias('maria')).map((a) => a.id)).toEqual([1101]);
  expect(propios(await h360.buscarAsistencias('H360-2026-11')).map((a) => a.id)).toEqual([1102, 1101]);
  expect(await h360.obtenerAsistenciaVigente(1103)).toBeNull();
  expect(await h360.obtenerAsistenciaVigente(1101)).toMatchObject({ codigo: 'H360-2026-1101', estado: 'NUEVO' });
});

test('exequias: no terminales entre ayer y mañana, primero las de la placa', async () => {
  const conPlaca = propios(await h360.buscarExequias({ placa: 'abc 110' }));
  expect(conPlaca.map((e) => e.id)).toEqual([1102, 1103, 1101]);
  expect(conPlaca[0]).toMatchObject({
    tipo: 'Cremación', hora: '08:00', estado: 'PENDIENTE_VEHICULO', asistencia_codigo: 'H360-2026-1102',
    nombre_ser_querido: 'Pedro Ruiz', vehiculo_placa: 'ABC110', es_de_la_placa: true,
  });
  expect(conPlaca[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(conPlaca[1].es_de_la_placa).toBe(false);

  expect(propios(await h360.buscarExequias({})).map((e) => e.id)).toEqual([1103, 1101, 1102]);
  expect(propios(await h360.buscarExequias({ q: 'pedro' })).map((e) => e.id)).toEqual([1102]);
  // una placa que normaliza a vacío equivale a no pasar placa
  const sinPlaca = propios(await h360.buscarExequias({ placa: '-' }));
  expect(sinPlaca.map((e) => e.id)).toEqual([1103, 1101, 1102]);
  expect(sinPlaca.every((e) => e.es_de_la_placa === false)).toBe(true);
});

test('exequias: las sin hora van al final de su día', async () => {
  await conn.query(`INSERT INTO exequias (id, asistencia_id, tipo, fecha, hora, lugar, vehiculo_id, estado) VALUES
    (1106, 1101, 'Misa', CURDATE(), NULL, 'Sin hora', NULL, 'PROGRAMADA')`);
  try {
    expect(propios(await h360.buscarExequias({})).map((e) => e.id)).toEqual([1103, 1101, 1106, 1102]);
  } finally {
    await conn.query('DELETE FROM exequias WHERE id = 1106');
  }
});

test('exequia vigente: sin ventana de fechas, excluye terminales', async () => {
  expect(await h360.obtenerExequiaVigente(1105)).toMatchObject({ id: 1105, estado: 'PROGRAMADA' });
  expect(await h360.obtenerExequiaVigente(1104)).toBeNull();
});
