const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
const base = '/api/trk/v1/usuarios';
let admin;

beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
});
afterAll(cerrar);

const comoAdmin = (req) => req.set('Authorization', `Bearer ${admin.token}`);

test('TRK-USR-002 crea jurado con PIN de 6 dígitos que sirve para entrar, y audita', async () => {
  const r = await comoAdmin(request(servidor).post(base)).send({ nombre: 'Jurado Uno', rol: 'TRK_JURADO' });
  expect(r.status).toBe(201);
  expect(r.headers['x-trk-api']).toBe('TRK-USR-002');
  expect(r.body.data.pin).toMatch(/^\d{6}$/);
  expect(r.body.data.usuario).toMatchObject({ nombre: 'Jurado Uno', rol: 'TRK_JURADO', activo: true });

  const login = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: r.body.data.usuario.id, pin: r.body.data.pin });
  expect(login.status).toBe(200);

  const auditoria = await db.TrkAuditoria.findOne({ where: { entidad: 'usuario', entidad_id: String(r.body.data.usuario.id) } });
  expect(auditoria).toMatchObject({ api_codigo: 'TRK-USR-002', accion: 'CREAR', usuario_id: admin.usuario.id });
  expect(JSON.stringify(auditoria.despues)).not.toMatch(r.body.data.pin);
});

test('rol inválido → 400', async () => {
  const r = await comoAdmin(request(servidor).post(base)).send({ nombre: 'X', rol: 'Administrador' });
  expect(r.status).toBe(400);
});

test('TRK-USR-001 lista solo usuarios operativos', async () => {
  await crearOperativo('TRK_CABINA', { nombre: 'Cabina' });
  await crearOperativo('TRK_JURADO', { nombre: 'Ana' });
  const r = await comoAdmin(request(servidor).get(base));
  expect(r.status).toBe(200);
  expect(r.body.data.map((u) => [u.nombre, u.rol])).toEqual([['Cabina', 'TRK_CABINA'], ['Ana', 'TRK_JURADO']]);
});

test('sin permiso administrar → 403 con código y motivo', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const r = await request(servidor).get(base).set('Authorization', `Bearer ${jurado.token}`);
  expect(r.status).toBe(403);
  expect(r.body).toMatchObject({ success: false, error: 'TRK-USR-001', motivo: 'SIN_PERMISO' });
});

test('TRK-USR-004 regenerar PIN invalida sesiones y el PIN viejo', async () => {
  const jurado = await crearOperativo('TRK_JURADO', { pin: '101010' });
  const r = await comoAdmin(request(servidor).post(`${base}/${jurado.usuario.id}/pin`));
  expect(r.status).toBe(200);
  expect(r.body.data.pin).toMatch(/^\d{6}$/);

  const yoViejo = await request(servidor).get('/api/trk/v1/auth/yo').set('Authorization', `Bearer ${jurado.token}`);
  expect(yoViejo.status).toBe(401);
  const pinViejo = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: jurado.usuario.id, pin: '101010' });
  expect(pinViejo.status).toBe(401);
  const pinNuevo = await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: jurado.usuario.id, pin: r.body.data.pin });
  expect(pinNuevo.status).toBe(200);
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-USR-004', accion: 'REGENERAR_PIN' } })).toBe(1);
});

test('TRK-USR-003 desactivar impide entrar e invalida la sesión', async () => {
  const cabina = await crearOperativo('TRK_CABINA', { pin: '202020' });
  const r = await comoAdmin(request(servidor).patch(`${base}/${cabina.usuario.id}`)).send({ activo: false });
  expect(r.status).toBe(200);
  expect(r.body.data.activo).toBe(false);
  expect((await request(servidor).get('/api/trk/v1/auth/yo').set('Authorization', `Bearer ${cabina.token}`)).status).toBe(401);
  expect((await request(servidor).post('/api/trk/v1/auth/pin').send({ usuario_id: cabina.usuario.id, pin: '202020' })).status).toBe(401);
});

test('no se puede gestionar un usuario que no es operativo TRK', async () => {
  const r = await comoAdmin(request(servidor).patch(`${base}/${admin.usuario.id}`)).send({ nombre: 'Hack' });
  expect(r.status).toBe(404);
});
