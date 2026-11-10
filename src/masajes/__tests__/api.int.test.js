// API REST de Masajes de punta a punta (spec §8, §17) contra la BD de pruebas.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { limpiar, insertarBeneficiario, insertarSemana } = require('../testing/fabricas');
const { crearAppPrueba, configDePrueba } = require('../testing/appPrueba');
const { crearDirectorioFalso } = require('../testing/directorioFalso');
const { crearXlsx, fila } = require('../testing/xlsx');
const { firmarToken, ROLES } = require('../services/auth.service');
const { crearRouterMasajes } = require('../routes');
const { TIPO_XLSX } = require('../routes/admin.routes');

const CFG = configDePrueba();
const AHORA = new Date('2026-11-20T13:00:00Z'); // viernes 20-nov 8:00 local
const lun9 = '2026-11-23T09:00:00-05:00';
const mar9 = '2026-11-24T09:00:00-05:00';
let conn;
let bd;
let app;
beforeAll(async () => { conn = await abrirConexion(); bd = crearBdDePrueba(); });
afterAll(async () => { await bd.cerrar(); await conn.end(); });
beforeEach(async () => {
  await limpiar(conn);
  app = crearAppPrueba({ bd, directorio: crearDirectorioFalso({}), reloj: () => AHORA });
});
afterEach(cerrarServidores);

const token = (usuario, rol = ROLES.EMPLEADO) => firmarToken({ usuario, nombre: usuario, rol }, CFG);
const ADMIN = () => token('admin1', ROLES.ADMIN);
const api = async () => request(await servir(app));
const conToken = (req, t) => req.set('Authorization', `Bearer ${t}`);
const filas = async (sql, p = []) => (await conn.query(sql, p))[0];
async function empleado(usuario = 'eortega', extra = {}) {
  const id = await insertarBeneficiario(conn, { ad_usuario: usuario, nombre: 'Edwin Ortega', celular: '573152884079', ...extra });
  return { id, t: token(usuario) };
}

// ---------------------------------------------------------------------------------------------------------
// Todas las rutas del módulo: si se agrega una y no se lista aquí, la prueba de conteo falla.
const RUTAS = [
  ['get', '/me'], ['get', '/disponibilidad?desde=2026-11-23&hasta=2026-11-27'], ['post', '/citas'],
  ['patch', '/citas/1/reprogramar'], ['post', '/citas/1/cancelar'],
  ['get', '/auth/sesion'],
  ['get', '/admin/disponibilidad?desde=2026-11-23&hasta=2026-11-27'], ['get', '/admin/cobertura?periodo=2026-11'],
  ['get', '/admin/semanas?desde=2026-11-01&hasta=2026-11-30'], ['post', '/admin/semanas'], ['get', '/admin/semanas/1'],
  ['patch', '/admin/semanas/1'], ['post', '/admin/semanas/1/publicar'], ['post', '/admin/semanas/1/cerrar'],
  ['post', '/admin/semanas/1/bloqueos'], ['delete', '/admin/semanas/1/bloqueos/1'],
  ['get', '/admin/beneficiarios'], ['post', '/admin/beneficiarios/importar'], ['get', '/admin/beneficiarios/1'],
  ['post', '/admin/beneficiarios'], ['patch', '/admin/beneficiarios/1'],
  ['get', '/admin/citas'], ['post', '/admin/citas'], ['patch', '/admin/citas/1/reprogramar'], ['post', '/admin/citas/1/cancelar'],
  ['patch', '/admin/citas/1/asistencia'],
  ['get', '/admin/notificaciones'], ['post', '/admin/notificaciones/1/reintentar'],
];
const PUBLICAS = [['get', '/health'], ['post', '/auth/login']];

function contarRutas(stack) {
  let n = 0;
  for (const layer of stack) {
    if (layer.route) n += Object.keys(layer.route.methods).length;
    else if (layer.handle && layer.handle.stack) n += contarRutas(layer.handle.stack);
  }
  return n;
}

describe('autenticación de todas las rutas', () => {
  test('la lista cubre todas las rutas registradas en el router', () => {
    const router = crearRouterMasajes({ bd, obtenerConfig: () => CFG, directorio: {} });
    expect(contarRutas(router.stack)).toBe(RUTAS.length + PUBLICAS.length);
  });

  test.each(RUTAS)('%s %s sin token → 401 NO_AUTENTICADO', async (m, ruta) => {
    const r = await (await api())[m](`/api/masajes/v1${ruta}`);
    expect(r.status).toBe(401);
    expect(r.body.motivo).toBe('NO_AUTENTICADO');
  });

  test('un token de Portería o del auth principal de Mantix no abre ninguna ruta', async () => {
    const porteria = jwt.sign({ scope: 'porteria', rol: 'admin_porteria', nombre: 'x' }, process.env.PORTERIA_JWT_SECRET, { subject: 'admin1', expiresIn: '1h' });
    const mantix = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    for (const t of [porteria, mantix]) {
      expect((await conToken((await api()).get('/api/masajes/v1/admin/citas'), t)).status).toBe(401);
      expect((await conToken((await api()).get('/api/masajes/v1/me'), t)).status).toBe(401);
    }
  });

  test.each(RUTAS.filter(([, r]) => r.startsWith('/admin')))('%s %s con rol empleado → 403 NO_ADMIN', async (m, ruta) => {
    const r = await conToken((await api())[m](`/api/masajes/v1${ruta}`), token('eortega'));
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('NO_ADMIN');
  });

  test('usuario con token válido pero fuera del listado → 403 NO_BENEFICIARIO', async () => {
    const r = await conToken((await api()).get('/api/masajes/v1/me'), token('intruso'));
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'MSJ-EMP-001', motivo: 'NO_BENEFICIARIO' });
  });

  test('fuera del listado → 403 NO_BENEFICIARIO en TODAS las rutas de empleado, también las de escritura (nunca 500)', async () => {
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const t = token('intruso');
    const casos = [
      ['get', '/disponibilidad?desde=2026-11-23&hasta=2026-11-27', 'MSJ-EMP-002'],
      ['post', '/citas', 'MSJ-CIT-001', { inicio: lun9 }], ['patch', '/citas/1/reprogramar', 'MSJ-CIT-002', { inicio: mar9 }],
      ['post', '/citas/1/cancelar', 'MSJ-CIT-003', {}],
    ];
    for (const [m, ruta, codigo, cuerpo] of casos) {
      const r = await conToken((await api())[m](`/api/masajes/v1${ruta}`), t).send(cuerpo);
      expect([ruta, r.status, r.body.error, r.body.motivo]).toEqual([ruta, 403, codigo, 'NO_BENEFICIARIO']);
    }
    expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 0 }]);
  });
});

describe('empleado', () => {
  test('GET /me: beneficiario, cupos del mes actual y siguiente y citas, sin campos internos', async () => {
    const { t } = await empleado();
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    await conToken((await api()).post('/api/masajes/v1/citas'), t).send({ inicio: lun9 });
    const r = await conToken((await api()).get('/api/masajes/v1/me'), t);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data.cupos)).toEqual(['2026-11', '2026-12']);
    expect(r.body.data.cupos['2026-11']).toMatchObject({ usado: true, estado: 'agendada' });
    expect(r.body.data.cupos['2026-12']).toEqual({ usado: false });
    expect(r.body.data.citas[0]).toMatchObject({ inicio: '2026-11-23T14:00:00.000Z', puedeModificar: true, modificableHasta: '2026-11-22T14:00:00.000Z' });
    expect(JSON.stringify(r.body)).not.toMatch(/slot_key|cupo_key|ad_usuario|573152884079|google_event_id/);
  });

  test('GET /disponibilidad: sin datos de otras personas; rango de más de 31 días → 400', async () => {
    const { t } = await empleado();
    const otro = await empleado('lgomez', { nombre: 'Luis Gomez', celular: '573001234567' });
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    await conToken((await api()).post('/api/masajes/v1/citas'), otro.t).send({ inicio: lun9 });
    const r = await conToken((await api()).get('/api/masajes/v1/disponibilidad?desde=2026-11-23&hasta=2026-11-27'), t);
    expect(r.status).toBe(200);
    expect(r.body.data.franjas.find((f) => f.inicio === '2026-11-23T14:00:00.000Z').estado).toBe('ocupada');
    expect(JSON.stringify(r.body)).not.toMatch(/Luis|Gomez|lgomez|573001234567|beneficiario/);
    expect((await conToken((await api()).get('/api/masajes/v1/disponibilidad?desde=2026-11-01&hasta=2026-12-31'), t)).status).toBe(400);
    expect((await conToken((await api()).get('/api/masajes/v1/disponibilidad?desde=2026-11-23&desde=2026-11-24&hasta=2026-11-27'), t)).status).toBe(400);
  });

  test('POST /citas agenda siempre para el propio beneficiario: un beneficiarioId en el cuerpo → 400 y nada creado', async () => {
    const { id, t } = await empleado();
    const victima = await insertarBeneficiario(conn);
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const r = await conToken((await api()).post('/api/masajes/v1/citas'), t).send({ inicio: lun9, beneficiarioId: victima });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: 'MSJ-CIT-001', motivo: 'VALIDACION', errors: [{ campo: 'body.beneficiarioId', motivo: 'object.unknown' }] });
    expect(await filas('SELECT COUNT(*) AS n FROM msj_citas')).toEqual([{ n: 0 }]);
    const ok = await conToken((await api()).post('/api/masajes/v1/citas'), t).send({ inicio: lun9 });
    expect(ok.status).toBe(201);
    expect(await filas('SELECT beneficiario_id FROM msj_citas')).toEqual([{ beneficiario_id: id }]);
  });

  test.each([
    [{ inicio: '2026-11-23T09:00' }, 'sin zona horaria'],
    [{ inicio: '2026-11-23T09:00:00.000-05:00' }, 'con milisegundos'],
    [{ inicio: 'mañana a las 9' }, 'basura'],
    [{ inicio: 1795438800000 }, 'número'],
    [{ inicio: lun9, estado: 'asistio' }, 'campo extra'],
    [{ inicio: lun9, slot_key: 'x#1' }, 'mass assignment'],
    [[{ inicio: lun9 }], 'arreglo en vez de objeto'],
  ])('POST /citas %j (%s) → 400 VALIDACION sin repetir el valor', async (cuerpo) => {
    const { t } = await empleado();
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const r = await conToken((await api()).post('/api/masajes/v1/citas'), t).send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body.motivo).toBe('VALIDACION');
    expect(JSON.stringify(r.body.errors)).not.toMatch(/mañana|1795438800000|asistio|x#1/);
  });

  test('reprogramar o cancelar la cita de otra persona → 404 y nada cambia; id no numérico → 400', async () => {
    const a = await empleado('aperez', { nombre: 'Ana Perez' });
    const b = await empleado();
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const c = (await conToken((await api()).post('/api/masajes/v1/citas'), a.t).send({ inicio: lun9 })).body.data;
    const r1 = await conToken((await api()).patch(`/api/masajes/v1/citas/${c.id}/reprogramar`), b.t).send({ inicio: mar9 });
    const r2 = await conToken((await api()).post(`/api/masajes/v1/citas/${c.id}/cancelar`), b.t).send({});
    expect([r1.status, r1.body.motivo, r2.status, r2.body.motivo]).toEqual([404, 'NO_ENCONTRADA', 404, 'NO_ENCONTRADA']);
    expect(await filas('SELECT estado, slot_key FROM msj_citas WHERE id = ?', [c.id])).toEqual([{ estado: 'agendada', slot_key: '2026-11-23T09:00#1' }]);
    expect((await conToken((await api()).post('/api/masajes/v1/citas/abc/cancelar'), b.t).send({})).status).toBe(400);
    expect((await conToken((await api()).post('/api/masajes/v1/citas/1e3/cancelar'), b.t).send({})).status).toBe(400);
  });

  test('flujo propio: agendar → reprogramar → cancelar', async () => {
    const { t } = await empleado();
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const c = (await conToken((await api()).post('/api/masajes/v1/citas'), t).send({ inicio: lun9 })).body.data;
    const r = await conToken((await api()).patch(`/api/masajes/v1/citas/${c.id}/reprogramar`), t).send({ inicio: mar9 });
    expect(r.body.data).toMatchObject({ id: c.id, inicio: '2026-11-24T14:00:00.000Z', estado: 'agendada' });
    const x = await conToken((await api()).post(`/api/masajes/v1/citas/${c.id}/cancelar`), t).send({ motivo: 'Viaje' });
    expect(x.body.data).toMatchObject({ id: c.id, estado: 'cancelada' });
  });

  test('21 escrituras seguidas del mismo usuario en un minuto → 429', async () => {
    const { t } = await empleado();
    for (let i = 0; i < 20; i++) expect((await conToken((await api()).post('/api/masajes/v1/citas'), t).send({})).status).toBe(400);
    const r = await conToken((await api()).post('/api/masajes/v1/citas'), t).send({});
    expect(r.status).toBe(429);
    expect(r.body.motivo).toBe('DEMASIADAS_SOLICITUDES');
    // Otro usuario no se ve afectado: el límite es por usuario, no por IP.
    const otro = await empleado('lgomez');
    expect((await conToken((await api()).post('/api/masajes/v1/citas'), otro.t).send({})).status).toBe(400);
  });

  test('cuerpo de más de 10 KB → 413', async () => {
    const { t } = await empleado();
    const r = await conToken((await api()).post('/api/masajes/v1/citas'), t).send({ inicio: lun9, x: 'y'.repeat(11 * 1024) });
    expect(r.status).toBe(413);
  });
});

describe('admin', () => {
  test('semanas: crear → publicar → bloquear → detalle con resumen; el código de error es el de la ruta', async () => {
    const t = ADMIN();
    const w = (await conToken((await api()).post('/api/masajes/v1/admin/semanas'), t).send({ fechaInicio: '2026-11-16', capacidad: 1 })).body.data;
    expect(w).toMatchObject({ estado: 'borrador', festivos: ['2026-11-16'] });
    expect((await conToken((await api()).post(`/api/masajes/v1/admin/semanas/${w.id}/publicar`), t)).body.data.estado).toBe('publicada');
    const bl = await conToken((await api()).post(`/api/masajes/v1/admin/semanas/${w.id}/bloqueos`), t)
      .send({ inicio: '2026-11-17T08:00:00-05:00', fin: '2026-11-17T12:00:00-05:00', motivo: 'spa', detalle: 'Mantenimiento' });
    expect(bl.status).toBe(201);
    const d = (await conToken((await api()).get(`/api/masajes/v1/admin/semanas/${w.id}`), t)).body.data;
    expect(d.resumen).toEqual({ franjas: 24, bloqueadas: 3, capacidadTotal: 21, ocupadas: 0, libres: 21 });
    const dup = await conToken((await api()).post('/api/masajes/v1/admin/semanas'), t).send({ fechaInicio: '2026-11-16' });
    expect(dup.status).toBe(409);
    expect(dup.headers['x-msj-api']).toBe('MSJ-ADM-011');
    expect(dup.body.error).toBe('MSJ-ADM-011');
    expect((await conToken((await api()).post('/api/masajes/v1/admin/semanas'), t).send({ fechaInicio: '2026-11-23', capacidad: '2' })).status).toBe(400);
  });

  test('citas: agendar por otro sin anticipación, cancelar exige motivo, asistencia', async () => {
    const t = ADMIN();
    const b = await insertarBeneficiario(conn, { nombre: 'Ana Perez' });
    await insertarSemana(conn, { fecha_inicio: '2026-11-16' });
    const c = (await conToken((await api()).post('/api/masajes/v1/admin/citas'), t).send({ beneficiarioId: b, inicio: '2026-11-20T09:00:00-05:00' })).body.data;
    expect(c).toMatchObject({ estado: 'agendada' });
    expect((await conToken((await api()).post(`/api/masajes/v1/admin/citas/${c.id}/cancelar`), t).send({})).status).toBe(400);
    const lista = (await conToken((await api()).get('/api/masajes/v1/admin/citas?periodo=2026-11&estado=agendada'), t)).body.data;
    expect(lista).toMatchObject({ total: 1, items: [{ id: c.id, beneficiario: { id: b, nombre: 'Ana Perez' } }] });
    expect((await conToken((await api()).patch(`/api/masajes/v1/admin/citas/${c.id}/asistencia`), t).send({ asistio: 'true' })).status).toBe(400);
    expect((await conToken((await api()).patch(`/api/masajes/v1/admin/citas/${c.id}/asistencia`), t).send({ asistio: true })).body.motivo).toBe('VALIDACION'); // aún no empieza
  });

  test('beneficiarios: listado con celular enmascarado, detalle completo, vinculación con historial y AD duplicado → 409', async () => {
    const t = ADMIN();
    const a = await insertarBeneficiario(conn, { nombre: 'Ana Perez', celular: '573152884079' });
    const b = await insertarBeneficiario(conn, { nombre: 'Luis Gomez', ad_usuario: 'lgomez' });
    const l = (await conToken((await api()).get('/api/masajes/v1/admin/beneficiarios?q=ana&sinVincular=true'), t)).body.data;
    expect(l).toMatchObject({ total: 1, items: [{ id: a, celular: '57315****079' }] });
    expect((await conToken((await api()).get(`/api/masajes/v1/admin/beneficiarios/${a}`), t)).body.data.celular).toBe('573152884079');
    const v = await conToken((await api()).patch(`/api/masajes/v1/admin/beneficiarios/${a}`), t).send({ adUsuario: 'APerez', cargo: 'Guía' });
    expect(v.body.data).toMatchObject({ ad_usuario: 'aperez', cargo: 'Guía' });
    expect(await filas('SELECT accion, motivo, usuario, es_admin FROM msj_cita_historial WHERE beneficiario_id = ?', [a]))
      .toEqual([{ accion: 'vinculacion', motivo: 'aperez', usuario: 'admin1', es_admin: 1 }]);
    const dup = await conToken((await api()).patch(`/api/masajes/v1/admin/beneficiarios/${a}`), t).send({ adUsuario: 'lgomez' });
    expect([dup.status, dup.body.motivo]).toEqual([409, 'AD_USUARIO_EN_USO']);
    expect((await conToken((await api()).patch(`/api/masajes/v1/admin/beneficiarios/${b}`), t).send({ activo: 'false' })).status).toBe(400);
    expect((await conToken((await api()).patch(`/api/masajes/v1/admin/beneficiarios/${b}`), t).send({ updated_by: 'otro' })).status).toBe(400);
    expect((await conToken((await api()).get('/api/masajes/v1/admin/beneficiarios?q=%25'), t)).body.data.total).toBe(0); // "%" no es comodín
  });

  test('importar: xlsx como cuerpo binario; simular no escribe; > 2 MB → 413; no xlsx → 400', async () => {
    const t = ADMIN();
    const xlsx = await crearXlsx({ filas: [fila(1, 'ANA PEREZ', 'Guía', '3152884079', 'ana@losolivos.co')] });
    const sim = await conToken((await api()).post('/api/masajes/v1/admin/beneficiarios/importar?simular=true'), t).set('Content-Type', TIPO_XLSX).send(xlsx);
    expect(sim.body.data).toMatchObject({ aplicado: false, creados: 1 });
    expect(await filas('SELECT COUNT(*) AS n FROM msj_beneficiarios')).toEqual([{ n: 0 }]);
    const ok = await conToken((await api()).post('/api/masajes/v1/admin/beneficiarios/importar'), t).set('Content-Type', TIPO_XLSX).send(xlsx);
    expect(ok.body.data).toMatchObject({ aplicado: true, creados: 1 });
    const grande = await conToken((await api()).post('/api/masajes/v1/admin/beneficiarios/importar'), t).set('Content-Type', TIPO_XLSX).send(Buffer.alloc(2 * 1024 * 1024 + 10, 1));
    expect(grande.status).toBe(413);
    const csv = await conToken((await api()).post('/api/masajes/v1/admin/beneficiarios/importar'), t).set('Content-Type', TIPO_XLSX).send(Buffer.from('NOMBRE,CELULAR\nAna,3152884079'));
    expect([csv.status, csv.body.errors[0].motivo]).toEqual([400, 'ARCHIVO_INVALIDO']);
    const sinTipo = await conToken((await api()).post('/api/masajes/v1/admin/beneficiarios/importar'), t).set('Content-Type', 'text/plain').send('hola');
    expect([sinTipo.status, sinTipo.body.errors[0].motivo]).toEqual([400, 'ARCHIVO_REQUERIDO']);
  });

  test('notificaciones: listar y reintentar solo las fallidas; cobertura del mes', async () => {
    const t = ADMIN();
    const { t: te } = await empleado();
    await insertarSemana(conn, { fecha_inicio: '2026-11-23' });
    const c = (await conToken((await api()).post('/api/masajes/v1/citas'), te).send({ inicio: lun9 })).body.data;
    const [n] = await filas("SELECT id FROM msj_notificaciones WHERE cita_id = ? AND tipo = 'spa_nueva'", [c.id]);
    expect((await conToken((await api()).post(`/api/masajes/v1/admin/notificaciones/${n.id}/reintentar`), t)).status).toBe(422); // está pendiente
    await conn.execute("UPDATE msj_notificaciones SET estado = 'fallido', intentos = 5 WHERE id = ?", [n.id]);
    expect((await conToken((await api()).get('/api/masajes/v1/admin/notificaciones?estado=fallido'), t)).body.data.total).toBe(1);
    expect((await conToken((await api()).post(`/api/masajes/v1/admin/notificaciones/${n.id}/reintentar`), t)).body.data).toEqual({ id: n.id, estado: 'pendiente' });
    expect(await filas('SELECT estado, intentos FROM msj_notificaciones WHERE id = ?', [n.id])).toEqual([{ estado: 'pendiente', intentos: 0 }]);
    const cob = (await conToken((await api()).get('/api/masajes/v1/admin/cobertura?periodo=2026-11'), t)).body.data;
    expect(cob).toEqual({ periodo: '2026-11', beneficiariosActivos: 1, agendados: 1, semanasPublicadas: 1, cuposLibres: 29 });
  });
});

describe('errores', () => {
  test('un error inesperado → 500 genérico, sin stack, SQL ni mensaje original', async () => {
    const roto = { consultar: async () => { const e = new Error("Duplicate entry '573152884079' for key x"); e.sqlMessage = e.message; e.sql = 'SELECT 1'; throw e; } };
    const servicios = require('../services').crearServicios({ bd, obtenerConfig: () => CFG, reloj: () => AHORA, disponibilidad: roto });
    const express = require('express');
    const a = express();
    a.use('/api/masajes/v1', crearRouterMasajes({ bd, obtenerConfig: () => CFG, directorio: {}, servicios }));
    const r = await conToken(request(await servir(a)).get('/api/masajes/v1/admin/disponibilidad?desde=2026-11-23&hasta=2026-11-27'), ADMIN());
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ success: false, error: 'MSJ-ADM-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
  });

  test('ruta inexistente con token de admin → 404 MSJ-SIS-002', async () => {
    const r = await conToken((await api()).get('/api/masajes/v1/admin/nada'), ADMIN());
    expect([r.status, r.body.error]).toEqual([404, 'MSJ-SIS-002']);
  });
});
