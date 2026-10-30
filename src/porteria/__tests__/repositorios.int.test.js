// src/porteria/__tests__/repositorios.int.test.js
// Placas R2…, sedes 2201-2202.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEventos = require('../repositorios/eventos');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');
const { crearRepositorioMotivos, aplica } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');

let conn;
let bd;
let tanqueo;
const base = (extra = {}) => ({
  sede_id: 2201, sentido: 'SALIDA', tipo_vehiculo: 'PROPIO', placa: 'R2A001', vehiculo_id: null,
  vehiculo_externo_id: null, motivo_id: tanqueo, asistencia_id: null, exequia_id: null, referencia_texto: null,
  referencia_snapshot: null, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_documento: null,
  conductor_otro: false, empresa: null, kilometraje: null, observaciones: null, evento_par_id: null,
  inconsistente: 0, inconsistencia_tipo: null, registrado_por: 'guarda1', ...extra,
});

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'R2%'");
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'R2%'");
  await conn.query("DELETE FROM por_vehiculos_externos WHERE placa LIKE 'R2%'");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

describe('eventos', () => {
  test('insertar y obtener: snapshot, booleanos y motivo', async () => {
    const id = await repoEventos.insertar(conn, base({ referencia_snapshot: { tipo: 'ASISTENCIA', codigo: 'H360-1' }, kilometraje: 10 }));
    const e = await repoEventos.obtener(conn, id);
    expect(e).toMatchObject({
      id, placa: 'R2A001', sentido: 'SALIDA', conductor_otro: false, inconsistente: false, anulado: false,
      kilometraje: 10, motivo: { id: tanqueo, codigo: 'TANQUEO', nombre: 'Tanqueo' },
      referencia: { tipo: 'ASISTENCIA', codigo: 'H360-1' },
    });
    expect(e).not.toHaveProperty('referencia_snapshot');
    expect(e.registrado_at).toBeInstanceOf(Date);
    expect(await repoEventos.antiguedadSegundos(conn, id)).toBeLessThan(60);
    expect(await repoEventos.obtener(conn, 999999999)).toBeNull();
  });

  test('ultimoVigente ignora anulados y desempata por id', async () => {
    const primero = await repoEventos.insertar(conn, base({ placa: 'R2B001' }));
    const segundo = await repoEventos.insertar(conn, base({ placa: 'R2B001', sentido: 'INGRESO' }));
    expect((await repoEventos.ultimoVigente(conn, 'R2B001')).id).toBe(segundo);
    await repoEventos.anular(conn, segundo, { usuario: 'admin', motivo: 'error' });
    expect((await repoEventos.ultimoVigente(conn, 'R2B001')).id).toBe(primero);
    expect(await repoEventos.ultimoVigente(conn, 'R2NADA')).toBeNull();
  });

  test('anular marca el registro y suelta el par de quien lo apunte', async () => {
    const salida = await repoEventos.insertar(conn, base({ placa: 'R2C001' }));
    const ingreso = await repoEventos.insertar(conn, base({ placa: 'R2C001', sentido: 'INGRESO', evento_par_id: salida }));
    await repoEventos.anular(conn, salida, { usuario: 'admin', motivo: 'Placa equivocada' });
    expect(await repoEventos.obtener(conn, salida)).toMatchObject({
      anulado: true, anulado_por: 'admin', anulado_motivo: 'Placa equivocada', evento_par_id: null,
    });
    expect((await repoEventos.obtener(conn, ingreso)).evento_par_id).toBeNull();
  });

  test('actualizar solo toca columnas editables y marca la corrección', async () => {
    const id = await repoEventos.insertar(conn, base({ placa: 'R2D001' }));
    await repoEventos.actualizar(conn, id, { kilometraje: 55, placa: 'OTRA', referencia_snapshot: { codigo: 'X' } }, 'admin');
    expect(await repoEventos.obtener(conn, id)).toMatchObject({
      placa: 'R2D001', kilometraje: 55, referencia: { codigo: 'X' }, corregido_por: 'admin',
    });
  });

  test('listar filtra y pagina, recientes primero', async () => {
    const ids = [];
    for (const placa of ['R2L001', 'R2L002', 'R2L003']) ids.push(await repoEventos.insertar(conn, base({ sede_id: 2202, placa })));
    const pagina1 = await repoEventos.listar(conn, { sedeId: 2202 }, { pagina: 1, porPagina: 2 });
    expect(pagina1.total).toBe(3);
    expect(pagina1.items.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    expect(pagina1).toMatchObject({ pagina: 1, por_pagina: 2 });
    expect((await repoEventos.listar(conn, { sedeId: 2202, placa: 'R2L002' })).items.map((e) => e.id)).toEqual([ids[1]]);
    const [[{ hoy }]] = await conn.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoy");
    expect((await repoEventos.listar(conn, { sedeId: 2202, desde: hoy, hasta: hoy })).total).toBe(3);
    expect((await repoEventos.listar(conn, { sedeId: 2202, hasta: '2000-01-01' })).total).toBe(0);
    expect((await repoEventos.listar(conn, { sedeId: 2202, inconsistente: true })).total).toBe(0);
  });
});

describe('estado', () => {
  test('bloquear crea la fila provisional, que no cuenta como estado', async () => {
    await conn.beginTransaction();
    const fila = await repoEstado.bloquear(conn, 'R2E001');
    await conn.commit();
    expect(fila).toEqual({
      placa: 'R2E001', tipo_vehiculo: null, sede_id: null, dentro: 0, ultimo_evento_id: null, salida_abierta_id: null, sembrado_at: null,
    });
    expect(await repoEstado.obtener(conn, 'R2E001')).toBeNull();
  });

  test('guardar, obtener, dentro de la sede, propios fuera y borrar', async () => {
    const ingreso = await repoEventos.insertar(conn, base({ placa: 'R2E002', sentido: 'INGRESO', tipo_vehiculo: 'PROVEEDOR', sede_id: 2201 }));
    await repoEstado.bloquear(conn, 'R2E002');
    await repoEstado.guardar(conn, { placa: 'R2E002', tipo_vehiculo: 'PROVEEDOR', sede_id: 2201, dentro: 1, ultimo_evento_id: ingreso, salida_abierta_id: null });
    const salida = await repoEventos.insertar(conn, base({ placa: 'R2E003' }));
    await repoEstado.bloquear(conn, 'R2E003');
    await repoEstado.guardar(conn, { placa: 'R2E003', tipo_vehiculo: 'PROPIO', sede_id: 2201, dentro: 0, ultimo_evento_id: salida, salida_abierta_id: salida });

    expect(await repoEstado.obtener(conn, 'R2E002')).toMatchObject({ dentro: 1, sede_id: 2201, ultimo_evento_id: ingreso, desde: expect.any(Date) });
    expect((await repoEstado.dentroDeSede(conn, 2201)).map((e) => e.placa)).toContain('R2E002');
    expect((await repoEstado.dentroDeSede(conn, 2201)).map((e) => e.placa)).not.toContain('R2E003');
    const fuera = await repoEstado.propiosFuera(conn, 2201);
    expect(fuera.map((e) => e.placa)).toContain('R2E003');
    expect(fuera.map((e) => e.placa)).not.toContain('R2E002');
    expect(fuera.find((e) => e.placa === 'R2E003').motivo.codigo).toBe('TANQUEO');
    expect((await repoEstado.propiosFuera(conn, null)).map((e) => e.placa)).toContain('R2E003');

    await repoEstado.borrar(conn, 'R2E003');
    expect(await repoEstado.obtener(conn, 'R2E003')).toBeNull();
  });
});

test('auditoría guarda antes y después como JSON', async () => {
  await registrarAuditoria(conn, {
    usuario: 'r2test', apiCodigo: 'POR-TST-001', entidad: 'evento', entidadId: 7, accion: 'CORREGIR',
    antes: { kilometraje: 1 }, despues: { kilometraje: 2 }, ip: '10.0.0.1',
  });
  const [[fila]] = await conn.query("SELECT * FROM por_auditoria WHERE usuario = 'r2test' ORDER BY id DESC LIMIT 1");
  expect(fila).toMatchObject({ api_codigo: 'POR-TST-001', entidad: 'evento', entidad_id: 7, accion: 'CORREGIR', ip: '10.0.0.1' });
  expect(fila.antes).toEqual({ kilometraje: 1 });
  expect(fila.despues).toEqual({ kilometraje: 2 });
});

test('motivos: obtener y aplica', async () => {
  const motivos = crearRepositorioMotivos(bd);
  const m = await motivos.obtener(tanqueo);
  expect(m).toMatchObject({ codigo: 'TANQUEO', activo: true, aplica_propio: true, aplica_proveedor: false, referencia_obligatoria: false });
  expect(aplica(m, 'PROPIO', 'SALIDA')).toBe(true);
  expect(aplica(m, 'PROVEEDOR', 'SALIDA')).toBe(false);
  expect(await motivos.obtener(999999)).toBeNull();
});

describe('vehículos externos', () => {
  test('crear, duplicado, obtener, buscar y actualizar', async () => {
    const repo = crearRepositorioVehiculosExternos(bd);
    const id = await repo.crear({ placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Flores del Norte', descripcion: null, usuario: 'guarda1' });
    expect(await repo.obtenerPorId(id)).toMatchObject({ id, placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Flores del Norte', activo: true });
    await expect(repo.crear({ placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Otra', usuario: 'x' }))
      .rejects.toMatchObject({ statusCode: 409, motivo: 'PLACA_DUPLICADA', message: 'La placa ya está en el catálogo' });
    expect((await repo.buscar('flores')).map((v) => v.placa)).toContain('R2V001');
    expect(await repo.actualizar(id, { activo: false, empresa: 'Flores SAS' }, 'admin')).toBe(true);
    expect((await repo.buscar('flores')).map((v) => v.placa)).not.toContain('R2V001');
    expect(await repo.obtenerPorPlaca('R2V001')).toMatchObject({ id, empresa: 'Flores SAS', activo: false });
    expect(await repo.actualizar(999999, { empresa: 'x' }, 'admin')).toBe(false);
    expect(await repo.obtenerPorPlaca('R2NADA')).toBeNull();
  });
});
