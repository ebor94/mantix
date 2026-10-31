// src/porteria/__tests__/reportes.int.test.js
// Placas A46…, ids 3040-3059.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearServicioReportes } = require('../services/reportes.service');

let conn;
let bd;
let tanqueo;
const insertar = async (campos) => {
  const columnas = Object.keys(campos);
  const [r] = await conn.query(`INSERT INTO por_eventos (${columnas.join(', ')}) VALUES (?)`, [columnas.map((c) => campos[c])]);
  return r.insertId;
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'A46%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3040 AND 3059`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3041, 'A46N', 'A46 Norte', 'Cúcuta', 1), (3042, 'A46S', 'A46 Sur', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3041, 'A46P001', 'Ford', 'Transit', 'CARROZA', 1)");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
  const base = { tipo_vehiculo: 'PROPIO', placa: 'A46P001', vehiculo_id: 3041, conductor_nombre: 'Juan', motivo_id: tanqueo, registrado_por: 'guarda1' };
  const salida = await insertar({ ...base, sede_id: 3041, sentido: 'SALIDA', kilometraje: 1000, registrado_at: '2026-10-20 08:00:00' });
  await insertar({ ...base, sede_id: 3042, sentido: 'INGRESO', kilometraje: 1042, evento_par_id: salida, registrado_at: '2026-10-20 09:30:00' });
  await insertar({
    ...base, sede_id: 3042, sentido: 'INGRESO', registrado_at: '2026-10-21 07:00:00',
    inconsistente: 1, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', observaciones: 'Llegó sin salida',
  });
  await insertar({ ...base, sede_id: 3041, sentido: 'SALIDA', registrado_at: '2026-10-21 08:00:00', anulado: 1 });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('devuelve los movimientos vigentes en orden, con viaje, observaciones y fecha local', async () => {
  const filas = await crearServicioReportes({ bd }).movimientos({ placa: 'A46P001' });
  expect(filas.map((f) => [f.fecha, f.sede_nombre, f.sentido])).toEqual([
    ['2026-10-20 08:00', 'A46 Norte', 'SALIDA'],
    ['2026-10-20 09:30', 'A46 Sur', 'INGRESO'],
    ['2026-10-21 07:00', 'A46 Sur', 'INGRESO'],
  ]);
  expect(filas[1]).toMatchObject({ duracion_min: 90, km_recorridos: 42, vehiculo_marca: 'Ford', motivo_nombre: expect.any(String), inconsistente: false, conductor_otro: false });
  expect(filas[2]).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', observaciones: 'Llegó sin salida' });
});

test('aplica los mismos filtros que la consulta de eventos', async () => {
  const servicio = crearServicioReportes({ bd });
  expect(await servicio.movimientos({ placa: 'A46P001', sedeId: 3041 })).toHaveLength(1);
  expect(await servicio.movimientos({ placa: 'A46P001', inconsistente: true })).toHaveLength(1);
  expect(await servicio.movimientos({ placa: 'A46P001', desde: '2026-10-21', hasta: '2026-10-21' })).toHaveLength(1);
});

test('por encima del tope → 413 DEMASIADOS_REGISTROS', async () => {
  const error = await crearServicioReportes({ bd, limite: 2 }).movimientos({ placa: 'A46P001' }).then(() => null, (e) => e);
  expect(error).toMatchObject({
    statusCode: 413, motivo: 'DEMASIADOS_REGISTROS',
    message: 'El reporte supera 2 movimientos. Acota las fechas o los filtros.',
  });
});
