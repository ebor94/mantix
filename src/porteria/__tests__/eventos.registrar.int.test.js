// src/porteria/__tests__/eventos.registrar.int.test.js
// Placas E5…, ids 2501-2599.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
let listaCompleta = true;
const m = {};
const sesionA = { usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'guarda', sede_id: 2501, sede_nombre: 'E5 Norte' };
const sesionB = { ...sesionA, usuario: 'guarda2', sede_id: 2502, sede_nombre: 'E5 Sur' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const estadoDe = async (placa) => (await conn.query('SELECT * FROM por_estado_vehiculo WHERE placa = ?', [placa]))[0][0];

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'E5%'`);
  for (const t of ['asistencias', 'vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2500 AND 2599`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2501, 'E5N', 'E5 Norte', 'Cúcuta', 1), (2502, 'E5S', 'E5 Sur', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2501, 'E5P-001', 'Ford', 'F', 'CARROZA', 1), (2502, 'E5P 002', 'Kia', 'K', 'CARROZA', 1), (2503, 'E5P003', 'Kia', 'K', 'CARROZA', 1)");
  await conn.query("INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado) VALUES (2501, 'H360-E5-2501', 'María Gómez', 'C-1', 'NUEVO'), (2502, 'H360-E5-2502', 'Ana', 'C-2', 'CERRADO')");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;

  const conductores = {
    buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta }),
  };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('propio sin historial: la primera salida es coherente y deja la salida abierta', async () => {
  const ev = await eventos.registrar(
    { sentido: 'SALIDA', placa: 'e5p 001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez', kilometraje: 1000 },
    sesionA, { ip: '10.0.0.5', apiCodigo: 'POR-EVT-001' },
  );
  expect(ev).toMatchObject({
    placa: 'E5P001', tipo_vehiculo: 'PROPIO', vehiculo_id: 2501, sentido: 'SALIDA', sede_id: 2501, registrado_por: 'guarda1',
    conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', kilometraje: 1000, inconsistente: false, evento_par_id: null,
    motivo: { codigo: 'TANQUEO' },
  });
  expect(await estadoDe('E5P001')).toMatchObject({ dentro: 0, sede_id: 2501, tipo_vehiculo: 'PROPIO', ultimo_evento_id: ev.id, salida_abierta_id: ev.id });
  const [[aud]] = await conn.query("SELECT * FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ?", [ev.id]);
  expect(aud).toMatchObject({ accion: 'CREAR', usuario: 'guarda1', api_codigo: 'POR-EVT-001', ip: '10.0.0.5' });
  expect(aud.despues).toMatchObject({ id: ev.id, placa: 'E5P001' });
});

test('el ingreso por otra sede cierra el viaje', async () => {
  const salida = (await estadoDe('E5P001')).salida_abierta_id;
  const ev = await eventos.registrar({ sentido: 'INGRESO', placa: 'E5P001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez', kilometraje: 1042 }, sesionB);
  expect(ev).toMatchObject({ evento_par_id: salida, inconsistente: false, sede_id: 2502 });
  expect(await estadoDe('E5P001')).toMatchObject({ dentro: 1, sede_id: 2502, ultimo_evento_id: ev.id, salida_abierta_id: null });
});

test('ingreso estando dentro: 409; forzar exige observación y queda inconsistente', async () => {
  const cuerpo = { sentido: 'INGRESO', placa: 'E5P001', motivo_id: m.LAVADO, conductor_usuario: 'jperez' };
  const err = await errorDe(eventos.registrar(cuerpo, sesionA));
  expect(err).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE' });
  expect(err.message).toMatch(/figura dentro/);
  expect(err.errors.estado).toMatchObject({ dentro: true, sede_id: 2502, desde: expect.any(Date) });

  expect(await errorDe(eventos.registrar({ ...cuerpo, forzar: true }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'Escribe una observación para registrar igual' });

  const ev = await eventos.registrar({ ...cuerpo, forzar: true, observaciones: 'Entró sin registrar salida' }, sesionA);
  expect(ev).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', evento_par_id: null });
  const [[aud]] = await conn.query("SELECT accion FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ?", [ev.id]);
  expect(aud.accion).toBe('FORZAR');
});

test('proveedor nuevo: exige tipo, se guarda en el catálogo y la próxima vez se autocompleta', async () => {
  const cuerpo = { sentido: 'INGRESO', placa: 'E5V-001', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'Flores del Norte', conductor_nombre: 'Ana', conductor_documento: '123' };
  expect(await errorDe(eventos.registrar(cuerpo, sesionA))).toMatchObject({ statusCode: 422, message: 'Indica el tipo de vehículo' });

  const ingreso = await eventos.registrar({ ...cuerpo, tipo_vehiculo: 'PROVEEDOR', guardar_en_catalogo: true }, sesionA);
  expect(ingreso).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', empresa: 'Flores del Norte', vehiculo_externo_id: expect.any(Number), kilometraje: null });
  const [[catalogo]] = await conn.query("SELECT * FROM por_vehiculos_externos WHERE placa = 'E5V001'");
  expect(catalogo).toMatchObject({ id: ingreso.vehiculo_externo_id, tipo: 'PROVEEDOR', empresa: 'Flores del Norte', created_by: 'guarda1' });

  const salida = await eventos.registrar({ sentido: 'SALIDA', placa: 'E5V001', motivo_id: m.ENTREGA_MERCANCIA, conductor_nombre: 'Ana', conductor_documento: '123' }, sesionA);
  expect(salida).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', empresa: 'Flores del Norte', vehiculo_externo_id: catalogo.id, evento_par_id: null });
  expect(await estadoDe('E5V001')).toMatchObject({ dentro: 0, salida_abierta_id: null });
});

test('proveedor sin historial: su salida es incoherente', async () => {
  const err = await errorDe(eventos.registrar({
    sentido: 'SALIDA', placa: 'E5V002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
  }, sesionA));
  expect(err).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE', errors: { estado: { dentro: false, sede_id: null, desde: null } } });
  expect(await estadoDe('E5V002')).toBeUndefined();
});

test('una placa de la empresa siempre es PROPIO; PROPIO con placa desconocida → 422', async () => {
  const ev = await eventos.registrar({ sentido: 'SALIDA', placa: 'E5P002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.LAVADO, conductor_otro: true, conductor_nombre: 'Pedro' }, sesionA);
  expect(ev).toMatchObject({ tipo_vehiculo: 'PROPIO', vehiculo_id: 2502, conductor_otro: true, conductor_usuario: null, conductor_nombre: 'Pedro' });
  expect(await errorDe(eventos.registrar({ sentido: 'SALIDA', placa: 'E5X999', tipo_vehiculo: 'PROPIO', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'La placa no está registrada como vehículo de la empresa' });
});

test('motivo y referencia se validan contra H360 y se guarda el snapshot', async () => {
  const base = { sentido: 'INGRESO', placa: 'E5P002', conductor_usuario: 'jperez' };
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.ENTREGA_MERCANCIA }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'El motivo no aplica a este vehículo o sentido' });
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'Selecciona la asistencia' });
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS, asistencia_id: 2502 }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'La asistencia no existe o ya no está activa' });

  const ev = await eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS, asistencia_id: 2501 }, sesionA);
  expect(ev).toMatchObject({
    asistencia_id: 2501,
    referencia: { tipo: 'ASISTENCIA', codigo: 'H360-E5-2501', nombre_ser_querido: 'María Gómez', contrato: 'C-1' },
  });
});

test('conductor fuera de la lista: 422 con la lista completa; aceptado si el AD no respondió', async () => {
  const cuerpo = { sentido: 'SALIDA', placa: 'E5P002', motivo_id: m.LAVADO, conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' };
  listaCompleta = true;
  expect(await errorDe(eventos.registrar(cuerpo, sesionA))).toMatchObject({ statusCode: 422 });
  listaCompleta = false;
  try {
    expect(await eventos.registrar(cuerpo, sesionA)).toMatchObject({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' });
  } finally {
    listaCompleta = true;
  }
});

test('dos primeros registros simultáneos de una placa nueva: uno pasa y el otro es 409, nunca 500', async () => {
  const intento = () => eventos.registrar({
    sentido: 'INGRESO', placa: 'E5C001', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
  }, sesionA).then(() => 'ok', (e) => e.statusCode || e);
  const resultados = await Promise.all([intento(), intento()]);
  expect(resultados.sort()).toEqual([409, 'ok']);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM por_eventos WHERE placa = 'E5C001'");
  expect(n).toBe(1);
});

test('dos salidas simultáneas de una placa con historial: una pasa y la otra es 409', async () => {
  const intento = () => eventos.registrar({ sentido: 'SALIDA', placa: 'E5P003', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA)
    .then(() => 'ok', (e) => e.statusCode || e);
  expect(await intento()).toBe('ok');
  await eventos.registrar({ sentido: 'INGRESO', placa: 'E5P003', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA);
  const resultados = await Promise.all([intento(), intento()]);
  expect(resultados.sort()).toEqual([409, 'ok']);
});
