const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
const base = '/api/trk/v1/participantes';
let admin; let cabina; let jurado; let eventos;
const escuchar = (e) => eventos.push(e);

beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  cabina = await crearOperativo('TRK_CABINA');
  jurado = await crearOperativo('TRK_JURADO');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

const como = (quien, req) => req.set('Authorization', `Bearer ${quien.token}`);

async function calificacionDePrueba(p) {
  return db.TrkCalificacion.create({ participante_id: p.id, jurado_id: jurado.usuario.id, total: 50, enviada_at: new Date(), bloqueada: true });
}

test('TRK-PAR-003 alta rápida de cabina con datos mínimos (CA6)', async () => {
  const cat = await categoria('FELINOS');
  const r = await como(cabina, request(servidor).post(base)).send({
    responsable_nombre: 'Nora Díaz', responsable_telefono: '3009998877', mascota_nombre: 'Pelusa', especie: 'GATO', categoria_id: cat.id
  });
  expect(r.status).toBe(201);
  expect(r.headers['x-trk-api']).toBe('TRK-PAR-003');
  expect(r.body.data).toMatchObject({ mascota_nombre: 'Pelusa', estado: 'INSCRITO', origen: 'CABINA', responsable_telefono: '3009998877' });
  expect(eventos.map((e) => e.evento)).toContain('participante:actualizado');
});

test('alta duplicada (mismo documento y mascota) → 409 DUPLICADO', async () => {
  const cat = await categoria('PEQ_MED');
  await crearParticipante({ mascota_nombre: 'Kira', responsable_documento: '55555' });
  const r = await como(cabina, request(servidor).post(base)).send({
    responsable_nombre: 'Xavier', responsable_telefono: '3000000000', responsable_documento: '55555', mascota_nombre: 'KIRA', especie: 'PERRO', categoria_id: cat.id
  });
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('DUPLICADO');
});

test('jurado no puede crear → 403', async () => {
  const r = await como(jurado, request(servidor).post(base)).send({});
  expect(r.status).toBe(403);
});

test('TRK-PAR-004 cabina edita disfraz y categoría sin calificaciones → cambio directo', async () => {
  const p = await crearParticipante({ disfraz_nombre: 'Viejo' });
  const grandes = await categoria('GRANDES');
  const r = await como(cabina, request(servidor).patch(`${base}/${p.id}`)).send({ disfraz_nombre: 'Nuevo', categoria_id: grandes.id });
  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ requiere_confirmacion: false, participante: { disfraz_nombre: 'Nuevo', categoria_id: grandes.id } });
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-PAR-004', accion: 'CAMBIAR_CATEGORIA' } })).toBe(1);
});

test('con calificaciones, el cambio de categoría queda como propuesta (HU-5 CA4)', async () => {
  const p = await crearParticipante();
  await calificacionDePrueba(p);
  const grandes = await categoria('GRANDES');
  const r = await como(cabina, request(servidor).patch(`${base}/${p.id}`)).send({ categoria_id: grandes.id });
  expect(r.body.data.requiere_confirmacion).toBe(true);
  await p.reload();
  expect(p.categoria_propuesta_id).toBe(grandes.id);
  expect(p.categoria_id).not.toBe(grandes.id);
  expect(await db.TrkCalificacion.count({ where: { participante_id: p.id } })).toBe(1);
});

test('cabina no puede editar documento; admin sí', async () => {
  const p = await crearParticipante();
  const r = await como(cabina, request(servidor).patch(`${base}/${p.id}`)).send({ responsable_documento: '99999' });
  expect(r.status).toBe(403);
  const rA = await como(admin, request(servidor).patch(`${base}/${p.id}`)).send({ responsable_documento: '99999' });
  expect(rA.status).toBe(200);
  expect(rA.body.data.participante.responsable_documento).toBe('99999');
});

test('renombrar la mascota actualiza el nombre normalizado', async () => {
  const p = await crearParticipante({ mascota_nombre: 'Lassie' });
  await como(cabina, request(servidor).patch(`${base}/${p.id}`)).send({ mascota_nombre: 'Lassié Dos' });
  await p.reload();
  expect(p.mascota_nombre_norm).toBe('lassie dos');
});

test('TRK-PAR-008 marcar y desmarcar ausente', async () => {
  const p = await crearParticipante({ estado: 'INSCRITO' });
  const r = await como(cabina, request(servidor).patch(`${base}/${p.id}/estado`)).send({ estado: 'AUSENTE' });
  expect(r.status).toBe(200);
  expect(r.body.data.estado).toBe('AUSENTE');
  const r2 = await como(cabina, request(servidor).patch(`${base}/${p.id}/estado`)).send({ estado: 'INSCRITO' });
  expect(r2.body.data.estado).toBe('INSCRITO');
});

test('no se puede marcar ausente a quien ya está presente → 409 ESTADO_INVALIDO', async () => {
  const p = await crearParticipante({ estado: 'PRESENTE' });
  const r = await como(cabina, request(servidor).patch(`${base}/${p.id}/estado`)).send({ estado: 'AUSENTE' });
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('ESTADO_INVALIDO');
});
