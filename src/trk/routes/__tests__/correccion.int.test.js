const request = require('supertest');
const db = require('../../../models');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, calificar } = require('../../testing/fabricas');

const app = crearAppTrk();
let admin; let j1; let j2;
const P = { CREATIVIDAD: 10, SEGURIDAD: 10, ELABORACION: 10, PASARELA: 10 };
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  j1 = await crearOperativo('TRK_JURADO');
  j2 = await crearOperativo('TRK_JURADO');
});
afterAll(cerrar);
const comoAdmin = (r) => r.set('Authorization', `Bearer ${admin.token}`);

describe('TRK-PAR-007 confirmar cambio de categoría (§13.7)', () => {
  test('exige confirmación, borra calificaciones y deja auditoría con lo borrado', async () => {
    const grandes = await categoria('GRANDES');
    const p = await crearParticipante({ estado: 'PRESENTADO', categoria_propuesta_id: grandes.id, desempate_manual: 1 });
    await calificar(p, j1.usuario, P);
    await calificar(p, j2.usuario, P);

    const sin = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({});
    expect(sin.status).toBe(409);
    expect(sin.body).toMatchObject({ error: 'TRK-PAR-007', motivo: 'CONFIRMACION_REQUERIDA' });
    expect(sin.body.message).toContain('2');
    expect(await db.TrkCalificacion.count({ where: { participante_id: p.id } })).toBe(2);

    const con = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({ confirmar: true });
    expect(con.status).toBe(200);
    expect(con.body.data).toMatchObject({ categoria_id: grandes.id, categoria_propuesta_id: null, desempate_manual: null });
    expect(await db.TrkCalificacion.count({ where: { participante_id: p.id } })).toBe(0);
    const aud = await db.TrkAuditoria.findOne({ where: { api_codigo: 'TRK-PAR-007', accion: 'CAMBIAR_CATEGORIA' } });
    expect(aud.antes.calificaciones).toHaveLength(2);
    expect(aud.despues).toMatchObject({ categoria_id: grandes.id, calificaciones_borradas: 2 });
  });

  test('confirmar asigna orden_pasarela = MAX+1 en la categoría nueva', async () => {
    const grandes = await categoria('GRANDES');
    await crearParticipante({ categoriaCodigo: 'GRANDES', orden_pasarela: 4 });
    const p = await crearParticipante({ estado: 'PRESENTADO', orden_pasarela: 1, categoria_propuesta_id: grandes.id });
    await calificar(p, j1.usuario, P);
    const r = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({ confirmar: true });
    expect(r.status).toBe(200);
    await p.reload();
    expect(p.categoria_id).toBe(grandes.id);
    expect(p.orden_pasarela).toBe(5);
  });

  test('confirmaciones en paralelo a la misma categoría reciben órdenes distintos', async () => {
    const grandes = await categoria('GRANDES');
    const ps = [];
    for (let i = 0; i < 3; i += 1) {
      const p = await crearParticipante({ estado: 'PRESENTADO', orden_pasarela: i + 1, categoria_propuesta_id: grandes.id });
      await calificar(p, j1.usuario, P);
      ps.push(p);
    }
    const rs = await Promise.all(ps.map((p) => comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({ confirmar: true })));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    const ordenes = [];
    for (const p of ps) { await p.reload(); ordenes.push(p.orden_pasarela); }
    expect(new Set(ordenes).size).toBe(3);
  });

  test('sin propuesta → 400', async () => {
    const p = await crearParticipante();
    expect((await comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`)).send({ confirmar: true })).status).toBe(400);
  });

  test('solo admin (editar) confirma', async () => {
    const cabina = await crearOperativo('TRK_CABINA');
    const p = await crearParticipante();
    expect((await request(app).post(`/api/trk/v1/participantes/${p.id}/categoria/confirmar`).set('Authorization', `Bearer ${cabina.token}`).send({ confirmar: true })).status).toBe(403);
  });
});

describe('TRK-PAR-006 fusionar (§13.13)', () => {
  test('mismo jurado en ambos → 409 FUSION_CON_CHOQUE y no cambia nada', async () => {
    const origen = await crearParticipante({ mascota_nombre: 'Thor', estado: 'PRESENTADO' });
    const destino = await crearParticipante({ mascota_nombre: 'THOR', estado: 'PRESENTADO' });
    await calificar(origen, j1.usuario, P);
    await calificar(destino, j1.usuario, P);
    const r = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${origen.id}/fusionar`)).send({ destino_id: destino.id });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'TRK-PAR-006', motivo: 'FUSION_CON_CHOQUE' });
    await origen.reload();
    expect(origen.fusionado_en_id).toBeNull();
  });

  test('sin choque: mueve calificaciones, conserva la foto más reciente y oculta el origen', async () => {
    const viejo = new Date('2026-10-30T10:00:00-05:00');
    const nuevo = new Date('2026-10-30T11:00:00-05:00');
    const origen = await crearParticipante({ mascota_nombre: 'Thor', estado: 'PRESENTADO', foto_oficial_path: 'nueva.jpg', foto_oficial_at: nuevo });
    const destino = await crearParticipante({ mascota_nombre: 'Thor 2', estado: 'INSCRITO', foto_oficial_path: 'vieja.jpg', foto_oficial_at: viejo });
    await calificar(origen, j1.usuario, P);
    await calificar(destino, j2.usuario, P);
    const r = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${origen.id}/fusionar`)).send({ destino_id: destino.id });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: destino.id, estado: 'PRESENTADO', foto_url: '/uploads/trk/fotos/nueva.jpg' });
    expect(await db.TrkCalificacion.count({ where: { participante_id: destino.id } })).toBe(2);
    await origen.reload();
    expect(origen.fusionado_en_id).toBe(destino.id);
    const lista = await comoAdmin(request(app).get('/api/trk/v1/participantes'));
    expect(lista.body.data.map((x) => x.id)).toEqual([destino.id]);
    expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-PAR-006', accion: 'FUSIONAR' } })).toBe(2);
  });

  test('origen EN_PASARELA: re-apunta el evento, emite pasarela:cambio y audita completo', async () => {
    const origen = await crearParticipante({ mascota_nombre: 'Thor', estado: 'EN_PASARELA' });
    const destino = await crearParticipante({ mascota_nombre: 'Thor 2', estado: 'INSCRITO' });
    await db.TrkEventoEstado.update({ participante_en_pasarela_id: origen.id }, { where: { id: 1 } });
    const cal = await calificar(origen, j1.usuario, P);
    const eventos = [];
    const oyente = (e) => eventos.push(e);
    bus.on('trk', oyente);
    let r;
    try {
      r = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${origen.id}/fusionar`)).send({ destino_id: destino.id });
    } finally { bus.off('trk', oyente); }
    expect(r.status).toBe(200);
    expect((await db.TrkEventoEstado.findByPk(1)).participante_en_pasarela_id).toBe(destino.id);
    await origen.reload();
    expect(origen.estado).toBe('PRESENTADO');
    expect(origen.fusionado_en_id).toBe(destino.id);
    const cambio = eventos.find((e) => e.evento === 'pasarela:cambio');
    expect(cambio.payload.participante.id).toBe(destino.id);
    expect(cambio.payload.anteriores).toEqual([origen.id]);
    expect(eventos.some((e) => e.evento === 'participante:actualizado' && e.payload.participante.id === origen.id)).toBe(true);

    const audOrigen = await db.TrkAuditoria.findOne({ where: { api_codigo: 'TRK-PAR-006', accion: 'FUSIONAR', entidad_id: String(origen.id) } });
    expect(audOrigen.antes.estado).toBe('EN_PASARELA');
    expect(audOrigen.despues).toMatchObject({ fusionado_en_id: destino.id, estado: 'PRESENTADO' });
    const audDestino = await db.TrkAuditoria.findOne({ where: { api_codigo: 'TRK-PAR-006', accion: 'FUSIONAR', entidad_id: String(destino.id) } });
    expect(audDestino.despues.calificaciones_movidas).toEqual([{ id: cal.id, jurado_id: cal.jurado_id }]);
    expect(audDestino.despues.en_pasarela).toEqual({ antes: origen.id, despues: destino.id });
    expect(audDestino.antes.estado).toBe('INSCRITO');
  });

  test('origen con calificaciones en otra categoría → 409 CATEGORIAS_DISTINTAS', async () => {
    const origen = await crearParticipante({ estado: 'PRESENTADO', categoriaCodigo: 'GRANDES' });
    const destino = await crearParticipante({ estado: 'PRESENTADO', categoriaCodigo: 'FAMILIAR' });
    await calificar(origen, j1.usuario, P);
    const r = await comoAdmin(request(app).post(`/api/trk/v1/participantes/${origen.id}/fusionar`)).send({ destino_id: destino.id });
    expect(r.status).toBe(409);
    expect(r.body.motivo).toBe('CATEGORIAS_DISTINTAS');
  });

  test('fusionar consigo mismo → 400', async () => {
    const p = await crearParticipante();
    expect((await comoAdmin(request(app).post(`/api/trk/v1/participantes/${p.id}/fusionar`)).send({ destino_id: p.id })).status).toBe(400);
  });
});
