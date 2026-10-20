const request = require('supertest');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante, criteriosDe, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
let jurado; let eventos;
const escuchar = (e) => eventos.push(e);
beforeEach(async () => {
  await limpiar();
  jurado = await crearOperativo('TRK_JURADO');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

// Puntajes válidos tomados de la BD (maximo - k), sin constantes de rúbrica en la prueba.
async function puntajes(participante, k = 1) {
  return (await criteriosDe(participante)).map((c) => ({ criterio_id: c.id, puntaje: Math.max(c.puntaje_max - k, 0) }));
}
const enviar = (p, cuerpo, quien = jurado) => request(app).put(`/api/trk/v1/calificaciones/${p.id}`).set('Authorization', `Bearer ${quien.token}`).send(cuerpo);

test('TRK-CAL-002 crea y bloquea la calificación; el total lo calcula el servidor (CA6)', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const ps = await puntajes(p, 2);
  const r = await enviar(p, { puntajes: ps, total: 999 });
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-002');
  expect(r.body.data).toMatchObject({ participante_id: p.id, jurado_id: jurado.usuario.id, bloqueada: true, total: ps.reduce((s, x) => s + x.puntaje, 0) });
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-CAL-002', accion: 'CREAR', entidad: 'calificacion' } })).toBe(1);
  expect(eventos.filter((e) => e.evento === 'calificacion:recibida').map((e) => e.rooms)).toEqual([['admin']]);
});

test('§13.1 criterio por encima del máximo → 422 sin guardar', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const ps = await puntajes(p, 0);
  ps[0].puntaje += 1;
  const r = await enviar(p, { puntajes: ps });
  expect(r.status).toBe(422);
  expect(r.body).toMatchObject({ error: 'TRK-CAL-002', motivo: 'PUNTAJE_FUERA_DE_RANGO' });
  expect(await db.TrkCalificacion.count()).toBe(0);
});

test('§13.2 reintento offline idéntico → una sola fila y 200 sin error', async () => {
  const p = await crearParticipante({ estado: 'PRESENTADO' });
  const ps = await puntajes(p);
  const [r1, r2] = await Promise.all([enviar(p, { puntajes: ps }), enviar(p, { puntajes: ps })]);
  const r3 = await enviar(p, { puntajes: ps });
  expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200]);
  expect(await db.TrkCalificacion.count({ where: { participante_id: p.id } })).toBe(1);
  expect(await db.TrkCalificacionDetalle.count()).toBe(ps.length);
  expect(await db.TrkAuditoria.count({ where: { entidad: 'calificacion' } })).toBe(1);
});

test('§13.3 modificar una calificación bloqueada → 409 CALIFICACION_BLOQUEADA', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const ps = await puntajes(p);
  await enviar(p, { puntajes: ps });
  const distinto = ps.map((x, i) => (i === 0 ? { ...x, puntaje: x.puntaje - 1 } : x));
  const r = await enviar(p, { puntajes: distinto });
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('CALIFICACION_BLOQUEADA');
});

test('mascota que aún no sale a pasarela → 409 ESTADO_INVALIDO', async () => {
  const p = await crearParticipante({ estado: 'PRESENTE' });
  const r = await enviar(p, { puntajes: await puntajes(p) });
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('ESTADO_INVALIDO');
});

test('HU-4 CA1 categoría cerrada → 409 CATEGORIA_CERRADA', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  await (await categoria('PEQ_MED')).update({ abierta: false });
  const r = await enviar(p, { puntajes: await puntajes(p) });
  expect(r.status).toBe(409);
  expect(r.body.motivo).toBe('CATEGORIA_CERRADA');
});

test('rúbrica FAMILIAR exige su criterio adicional (los criterios vienen de la categoría)', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA', categoriaCodigo: 'FAMILIAR' });
  const ps = await puntajes(p);
  const r = await enviar(p, { puntajes: ps.slice(0, -1) });
  expect(r.status).toBe(422);
  expect(r.body.motivo).toBe('CRITERIO_FALTANTE');
  expect((await enviar(p, { puntajes: ps })).status).toBe(200);
});

test('solo jurados califican → cabina 403', async () => {
  const cabina = await crearOperativo('TRK_CABINA');
  const p = await crearParticipante({ estado: 'EN_PASARELA' });
  const r = await enviar(p, { puntajes: await puntajes(p) }, cabina);
  expect(r.status).toBe(403);
});
