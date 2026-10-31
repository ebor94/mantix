// src/porteria/__tests__/motivosAdmin.int.test.js
// Motivos T4_…, placa A44…, sede 3030. Los T4_ se borran al terminar: otras suites cuentan los motivos activos.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearServicioMotivosAdmin } = require('../services/motivosAdmin.service');

let conn;
let bd;
let servicio;
const admin = { usuario: 'adminT4', rol: 'admin_porteria', sede_id: null };
const ctx = { apiCodigo: 'POR-TST-044', ip: '10.0.0.44' };
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const errorDe = (p) => p.then(() => undefined, (e) => e);
const limpiar = async () => {
  await conn.query("DELETE e FROM por_eventos e JOIN por_motivos m ON m.id = e.motivo_id WHERE m.codigo LIKE 'T4\\_%'");
  await conn.query("DELETE FROM por_motivos WHERE codigo LIKE 'T4\\_%'");
};
const auditoria = async (id) => {
  const [filas] = await conn.query(
    "SELECT accion, usuario, api_codigo, antes, despues FROM por_auditoria WHERE entidad = 'motivo' AND entidad_id = ? ORDER BY id", [id],
  );
  return filas.map((f) => ({ ...f, antes: json(f.antes), despues: json(f.despues) }));
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await limpiar();
  await conn.query('DELETE FROM sedes WHERE id = 3030');
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3030, 'A44S', 'A44', 'Cúcuta', 1)");
  servicio = crearServicioMotivosAdmin({ bd });
});
afterAll(async () => {
  await limpiar();
  await bd.cerrar();
  await conn.end();
});

test('crear devuelve el motivo completo y lo audita', async () => {
  const creado = await servicio.crear({ codigo: 'T4_CREAR', nombre: 'Crear', aplica_proveedor: true, orden: 5, activo: false }, admin, ctx);
  expect(creado).toMatchObject({
    codigo: 'T4_CREAR', nombre: 'Crear', aplica_propio: false, aplica_proveedor: true, aplica_ingreso: true,
    tipo_referencia: 'NINGUNA', orden: 5, activo: false, en_uso: false, updated_by: 'adminT4',
  });
  expect(await auditoria(creado.id)).toEqual([
    expect.objectContaining({ accion: 'CREAR', usuario: 'adminT4', api_codigo: 'POR-TST-044', antes: null, despues: expect.objectContaining({ codigo: 'T4_CREAR' }) }),
  ]);
});

test('un código repetido → 409 CODIGO_DUPLICADO', async () => {
  await servicio.crear({ codigo: 'T4_DUP', nombre: 'Uno', aplica_propio: true, activo: false }, admin, ctx);
  expect(await errorDe(servicio.crear({ codigo: 't4_dup', nombre: 'Dos', aplica_propio: true }, admin, ctx))).toMatchObject({
    statusCode: 409, motivo: 'CODIGO_DUPLICADO', message: 'Ya existe un motivo con ese código',
  });
});

test('editar valida contra el estado guardado y audita antes y después', async () => {
  const m = await servicio.crear({ codigo: 'T4_EDITAR', nombre: 'Editar', aplica_propio: true, activo: false }, admin, ctx);
  expect(await errorDe(servicio.actualizar(m.id, { aplica_propio: false }, admin, ctx))).toMatchObject({
    statusCode: 400, message: 'Marca al menos un tipo de vehículo',
  });
  const editado = await servicio.actualizar(m.id, { nombre: 'Editado', tipo_referencia: 'TEXTO', referencia_obligatoria: true }, admin, ctx);
  expect(editado).toMatchObject({ nombre: 'Editado', tipo_referencia: 'TEXTO', referencia_obligatoria: true });
  const [, cambio] = await auditoria(m.id);
  expect(cambio).toMatchObject({ accion: 'CORREGIR', antes: expect.objectContaining({ nombre: 'Editar' }), despues: expect.objectContaining({ nombre: 'Editado' }) });
  expect(await errorDe(servicio.actualizar(3039999, { nombre: 'X' }, admin, ctx))).toMatchObject({ statusCode: 404, message: 'El motivo no existe' });
});

test('borrar: sin uso se borra y audita; con eventos → 409 MOTIVO_EN_USO', async () => {
  const libre = await servicio.crear({ codigo: 'T4_LIBRE', nombre: 'Libre', aplica_propio: true, activo: false }, admin, ctx);
  expect(await servicio.eliminar(libre.id, admin, ctx)).toEqual({ id: libre.id });
  const [quedan] = await conn.query('SELECT 1 FROM por_motivos WHERE id = ?', [libre.id]);
  expect(quedan).toEqual([]);
  expect((await auditoria(libre.id)).map((a) => a.accion)).toEqual(['CREAR', 'ELIMINAR']);

  const usado = await servicio.crear({ codigo: 'T4_USADO', nombre: 'Usado', aplica_propio: true, activo: false }, admin, ctx);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, conductor_nombre, motivo_id, registrado_por)
     VALUES (3030, 'SALIDA', 'PROPIO', 'A44P001', 'Juan', ?, 'guarda1')`, [usado.id],
  );
  expect((await servicio.listar()).find((x) => x.id === usado.id).en_uso).toBe(true);
  expect(await errorDe(servicio.eliminar(usado.id, admin, ctx))).toMatchObject({
    statusCode: 409, motivo: 'MOTIVO_EN_USO', message: 'El motivo tiene registros: inactívalo en lugar de borrarlo',
  });
});

test('listar incluye inactivos, en orden', async () => {
  const lista = await servicio.listar();
  expect(lista.length).toBeGreaterThanOrEqual(12);
  expect(lista.some((m) => m.codigo === 'T4_CREAR' && m.activo === false)).toBe(true);
  const ordenes = lista.map((m) => m.orden);
  expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
});
