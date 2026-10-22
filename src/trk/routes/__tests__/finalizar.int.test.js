const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, criteriosDe, calificar, borrador } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
afterAll(cerrar);

let jurado; let otro; let cat; let eventos;
const escuchar = (e) => eventos.push(e);
beforeEach(async () => {
  await limpiar();
  jurado = await crearOperativo('TRK_JURADO', { nombre: 'J1' });
  otro = await crearOperativo('TRK_JURADO', { nombre: 'J2' });
  cat = await categoria('PEQ_MED');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));

const conToken = (r, quien) => r.set('Authorization', `Bearer ${quien.token}`);
const finalizar = (categoriaId = cat.id, quien = jurado) => conToken(request(servidor).post('/api/trk/v1/calificaciones/finalizar').send({ categoria_id: categoriaId }), quien);
const matriz = (quien = jurado) => conToken(request(servidor).get(`/api/trk/v1/jurado/matriz?categoria=${cat.id}`), quien);
const puntos = (c, s, e, pa) => ({ CREATIVIDAD: c, SEGURIDAD: s, ELABORACION: e, PASARELA: pa });
const porParticipante = (r) => Object.fromEntries(r.body.data.calificaciones.map((c) => [c.participante_id, c]));

test('TRK-CAL-006 convierte los borradores completos en calificaciones bloqueadas, audita CREAR y avisa al admin por fila (CA6)', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'EN_PASARELA' });
  await borrador(toby, jurado.usuario, puntos(30, 25, 15, 10));
  await borrador(kira, jurado.usuario, puntos(20, 20, 10, 5));

  const r = await finalizar();
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-006');
  expect(r.body.data.categoria_id).toBe(cat.id);
  const cals = porParticipante(r);
  expect(cals[toby.id]).toMatchObject({ jurado_id: jurado.usuario.id, total: 80, bloqueada: true });
  expect(cals[kira.id]).toMatchObject({ total: 55, bloqueada: true });
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-CAL-006', accion: 'CREAR', entidad: 'calificacion' } })).toBe(2);
  expect(eventos.filter((e) => e.evento === 'calificacion:recibida').map((e) => e.rooms)).toEqual([['admin'], ['admin']]);
  expect(await db.TrkBorrador.count()).toBe(8); // se conservan para trazabilidad
  expect((await matriz()).body.data.filas.map((f) => f.final.estado)).toEqual(['FINAL', 'FINAL']);
  expect(await db.TrkCalificacion.count({ where: { jurado_id: otro.usuario.id } })).toBe(0);
});

test('todo o nada: una fila incompleta → 422 CALIFICACION_INCOMPLETA con los nombres y no se crea ninguna', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'EN_PASARELA' });
  await borrador(toby, jurado.usuario, puntos(30, 25, 15, 10));
  await borrador(kira, jurado.usuario, { CREATIVIDAD: 10, SEGURIDAD: null });

  const r = await finalizar();
  expect([r.status, r.body.motivo, r.body.error]).toEqual([422, 'CALIFICACION_INCOMPLETA', 'TRK-CAL-006']);
  expect(r.body.message).toContain('Kira');
  expect(r.body.message).not.toContain('Toby');
  expect(r.body.errors).toEqual([{ campo: kira.id, mensaje: expect.stringMatching(/^Kira: falta Seguridad, Elaboración, Pasarela$/) }]);
  expect(await db.TrkCalificacion.count()).toBe(0);
  expect(await db.TrkAuditoria.count({ where: { entidad: 'calificacion' } })).toBe(0);
  expect(eventos.filter((e) => e.evento === 'calificacion:recibida')).toEqual([]);
});

test('solo envía las pendientes; sin pendientes → 409 SIN_PENDIENTES; una mascota que desfila después vuelve a habilitarlo (CA8)', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  await borrador(toby, jurado.usuario, puntos(30, 25, 15, 10));
  expect((await finalizar()).status).toBe(200);

  const otraVez = await finalizar();
  expect([otraVez.status, otraVez.body.motivo]).toEqual([409, 'SIN_PENDIENTES']);

  const luna = await crearParticipante({ mascota_nombre: 'Luna', estado: 'EN_PASARELA' });
  await borrador(luna, jurado.usuario, puntos(10, 10, 10, 10));
  const r = await finalizar();
  expect(r.status).toBe(200);
  expect(r.body.data.calificaciones.map((c) => c.participante_id)).toEqual([luna.id]);
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-CAL-006', accion: 'CREAR' } })).toBe(2);
});

test('desbloqueada por el admin: se corrige el borrador y se reenvía con el botón final (auditoría REENVIAR) (CA7)', async () => {
  const admin = await crearAdmin();
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  await borrador(toby, jurado.usuario, puntos(30, 25, 15, 10));
  await finalizar();
  const cal = await db.TrkCalificacion.findOne({ where: { participante_id: toby.id } });

  const desb = await conToken(request(servidor).post(`/api/trk/v1/calificaciones/${cal.id}/desbloquear`), admin);
  expect(desb.status).toBe(200);
  const [creatividad] = await criteriosDe(toby);
  const corr = await conToken(request(servidor).put(`/api/trk/v1/borradores/${toby.id}`).send({ puntajes: [{ criterio_id: creatividad.id, puntaje: 1 }] }), jurado);
  expect(corr.status).toBe(200);

  const r = await finalizar();
  expect(r.status).toBe(200);
  expect(porParticipante(r)[toby.id]).toMatchObject({ id: cal.id, total: 51, bloqueada: true });
  const acciones = (await db.TrkAuditoria.findAll({ where: { entidad: 'calificacion', entidad_id: String(cal.id) }, order: [['id', 'ASC']] }))
    .map((a) => [a.accion, a.api_codigo]);
  expect(acciones).toEqual([['CREAR', 'TRK-CAL-006'], ['DESBLOQUEAR', 'TRK-CAL-003'], ['REENVIAR', 'TRK-CAL-006']]);
});

test('desbloqueada sin borradores (enviada con TRK-CAL-002) se reenvía con sus puntajes finales', async () => {
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO' });
  const cal = await calificar(kira, jurado.usuario, puntos(30, 25, 15, 10));
  await cal.update({ bloqueada: false });
  const r = await finalizar();
  expect(r.status).toBe(200);
  expect(porParticipante(r)[kira.id]).toMatchObject({ id: cal.id, total: 80, bloqueada: true });
  expect(await db.TrkAuditoria.count({ where: { accion: 'REENVIAR', api_codigo: 'TRK-CAL-006' } })).toBe(1);
});

test('categoría cerrada → 409 CATEGORIA_CERRADA; inexistente → 404; sin categoria_id → 400; sin sesión → 401', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  await borrador(toby, jurado.usuario, puntos(30, 25, 15, 10));
  await db.TrkCategoria.update({ abierta: false }, { where: { id: cat.id } });
  const cerrada = await finalizar();
  expect([cerrada.status, cerrada.body.motivo]).toEqual([409, 'CATEGORIA_CERRADA']);
  expect(await db.TrkCalificacion.count()).toBe(0);
  expect((await finalizar(9999)).status).toBe(404);
  expect((await conToken(request(servidor).post('/api/trk/v1/calificaciones/finalizar').send({}), jurado)).status).toBe(400);
  expect((await request(servidor).post('/api/trk/v1/calificaciones/finalizar').send({ categoria_id: cat.id })).status).toBe(401);
});
