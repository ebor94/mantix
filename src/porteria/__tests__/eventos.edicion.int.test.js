// src/porteria/__tests__/eventos.edicion.int.test.js
// Placas E6…, ids 2601-2699.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
const m = {};
const guarda1 = { usuario: 'guarda1', nombre: 'G1', rol: 'guarda', sede_id: 2601, sede_nombre: 'E6' };
const guarda2 = { ...guarda1, usuario: 'guarda2' };
const admin = { usuario: 'admin1', nombre: 'A', rol: 'admin_porteria', sede_id: 2601, sede_nombre: 'E6' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const estadoDe = async (placa) => (await conn.query('SELECT * FROM por_estado_vehiculo WHERE placa = ?', [placa]))[0][0];
const auditoriaDe = async (id, accion) => (await conn.query(
  "SELECT * FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ? AND accion = ? ORDER BY id DESC LIMIT 1", [id, accion],
))[0][0];
const salidaPropia = (placa, extra = {}) => ({ sentido: 'SALIDA', placa, motivo_id: m.TANQUEO, conductor_usuario: 'jperez', ...extra });

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'E6%'`);
  for (const t of ['asistencias', 'vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2600 AND 2699`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2601, 'E6', 'E6', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2601, 'E6P001', 'F', 'F', 'CARROZA', 1), (2602, 'E6P002', 'F', 'F', 'CARROZA', 1)");
  await conn.query("INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado) VALUES (2601, 'H360-E6-2601', 'Luis', 'C-6', 'NUEVO')");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;
  const conductores = { buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

describe('corregir', () => {
  let salida;
  beforeAll(async () => { salida = await eventos.registrar(salidaPropia('E6P001', { kilometraje: 10 }), guarda1); });

  test('el guarda corrige su registro reciente y queda auditado', async () => {
    const corregido = await eventos.corregir(salida.id, { motivo_id: m.LAVADO, kilometraje: 20 }, guarda1, { ip: '10.0.0.6', apiCodigo: 'POR-EVT-004' });
    expect(corregido).toMatchObject({ motivo: { codigo: 'LAVADO' }, kilometraje: 20, corregido_por: 'guarda1', placa: 'E6P001' });
    const aud = await auditoriaDe(salida.id, 'CORREGIR');
    expect(aud).toMatchObject({ usuario: 'guarda1', api_codigo: 'POR-EVT-004' });
    expect(aud.antes.motivo.codigo).toBe('TANQUEO');
    expect(aud.despues.motivo.codigo).toBe('LAVADO');
  });

  test('otro guarda o pasados 15 minutos → 403; el admin sí puede', async () => {
    const permiso = { statusCode: 403, motivo: 'SIN_PERMISO', message: 'Solo puedes corregir o anular tus registros de los últimos 15 minutos' };
    expect(await errorDe(eventos.corregir(salida.id, { kilometraje: 21 }, guarda2))).toMatchObject(permiso);
    await conn.query('UPDATE por_eventos SET registrado_at = NOW() - INTERVAL 16 MINUTE WHERE id = ?', [salida.id]);
    expect(await errorDe(eventos.corregir(salida.id, { kilometraje: 21 }, guarda1))).toMatchObject(permiso);
    expect(await eventos.corregir(salida.id, { kilometraje: 22 }, admin)).toMatchObject({ kilometraje: 22, corregido_por: 'admin1' });
  });

  test('placa o sentido no se corrigen; sin cambios → 400; inexistente → 404', async () => {
    expect(await errorDe(eventos.corregir(salida.id, { sentido: 'INGRESO' }, admin))).toMatchObject({ statusCode: 400 });
    expect(await errorDe(eventos.corregir(salida.id, {}, admin))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
    expect(await errorDe(eventos.corregir(999999999, { kilometraje: 1 }, admin))).toMatchObject({ statusCode: 404, motivo: 'NO_ENCONTRADO', message: 'El registro no existe' });
  });

  test('lo que no cambia no se revalida contra H360', async () => {
    const ingreso = await eventos.registrar({ sentido: 'INGRESO', placa: 'E6P001', motivo_id: m.SERES_QUERIDOS, asistencia_id: 2601, conductor_usuario: 'jperez' }, guarda1);
    await conn.query("UPDATE asistencias SET estado = 'CERRADO' WHERE id = 2601");
    try {
      expect(await eventos.corregir(ingreso.id, { kilometraje: 30 }, guarda1)).toMatchObject({ kilometraje: 30, asistencia_id: 2601 });
      expect(await errorDe(eventos.corregir(ingreso.id, { asistencia_id: 2601 }, guarda1)))
        .toMatchObject({ statusCode: 422, message: 'La asistencia no existe o ya no está activa' });
    } finally {
      await conn.query("UPDATE asistencias SET estado = 'NUEVO' WHERE id = 2601");
    }
  });

  test('un registro forzado no puede quedar sin observación', async () => {
    const forzado = await eventos.registrar(salidaPropia('E6P001', { forzar: true, observaciones: 'x', sentido: 'INGRESO' }), guarda1);
    expect(forzado.inconsistente).toBe(true);
    expect(await errorDe(eventos.corregir(forzado.id, { observaciones: '' }, guarda1)))
      .toMatchObject({ statusCode: 422, message: 'El registro forzado necesita una observación' });
  });
});

describe('anular', () => {
  test('anular el ingreso que cerraba el viaje reabre la salida', async () => {
    const salida = await eventos.registrar(salidaPropia('E6P002'), guarda1);
    const ingreso = await eventos.registrar({ ...salidaPropia('E6P002'), sentido: 'INGRESO' }, guarda1);
    expect(ingreso.evento_par_id).toBe(salida.id);

    const anulado = await eventos.anular(ingreso.id, { motivo: 'Se registró dos veces' }, guarda1, { ip: '10.0.0.7', apiCodigo: 'POR-EVT-005' });
    expect(anulado).toMatchObject({ anulado: true, anulado_por: 'guarda1', anulado_motivo: 'Se registró dos veces', evento_par_id: null });
    expect(await estadoDe('E6P002')).toMatchObject({ dentro: 0, ultimo_evento_id: salida.id, salida_abierta_id: salida.id });
    expect(await auditoriaDe(ingreso.id, 'ANULAR')).toMatchObject({ usuario: 'guarda1', api_codigo: 'POR-EVT-005' });

    expect(await errorDe(eventos.anular(ingreso.id, { motivo: 'otra vez' }, guarda1)))
      .toMatchObject({ statusCode: 409, motivo: 'ANULADO', message: 'El registro ya está anulado' });
    expect(await errorDe(eventos.corregir(ingreso.id, { kilometraje: 1 }, admin)))
      .toMatchObject({ statusCode: 409, motivo: 'ANULADO', message: 'El registro está anulado' });
  });

  test('anular la salida de un viaje cerrado suelta el par y deja el vehículo dentro', async () => {
    const ingresoNuevo = await eventos.registrar({ ...salidaPropia('E6P002'), sentido: 'INGRESO' }, guarda1);
    const ultimaSalida = (await conn.query("SELECT id FROM por_eventos WHERE placa = 'E6P002' AND sentido = 'SALIDA' AND anulado = 0"))[0][0].id;
    await eventos.anular(ultimaSalida, { motivo: 'No salió' }, admin);
    expect((await eventos.obtener(ingresoNuevo.id)).evento_par_id).toBeNull();
    expect(await estadoDe('E6P002')).toMatchObject({ dentro: 1, ultimo_evento_id: ingresoNuevo.id, salida_abierta_id: null });
  });

  test('anular el único evento de una placa borra su estado', async () => {
    const ev = await eventos.registrar({
      sentido: 'INGRESO', placa: 'E6V001', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
    }, guarda1);
    await eventos.anular(ev.id, { motivo: 'Placa equivocada' }, guarda1);
    expect(await estadoDe('E6V001')).toBeUndefined();
  });

  test('sin motivo → 400; de otro guarda → 403', async () => {
    const ev = await eventos.registrar({
      sentido: 'INGRESO', placa: 'E6V002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
    }, guarda1);
    expect(await errorDe(eventos.anular(ev.id, { motivo: '  ' }, guarda1)))
      .toMatchObject({ statusCode: 400, message: 'Escribe el motivo de la anulación' });
    expect(await errorDe(eventos.anular(ev.id, {}, guarda1))).toMatchObject({ statusCode: 400 });
    expect(await errorDe(eventos.anular(ev.id, { motivo: 'x' }, guarda2))).toMatchObject({ statusCode: 403 });
  });
});
