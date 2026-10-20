const http = require('http');
const request = require('supertest');
const { io: cliente } = require('socket.io-client');
const { attach } = require('..');
const { emitir } = require('../bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante } = require('../../testing/fabricas');

const SENSIBLES = ['responsable_documento', 'responsable_telefono', 'responsable_correo', 'responsable_nombre'];
let server; let io; let url; let sockets;
let admin; let jurado; let comentarista;

beforeAll((done) => {
  server = http.createServer(crearAppTrk());
  io = attach(server);
  server.listen(0, () => { url = `http://localhost:${server.address().port}/trk`; done(); });
});
afterAll(async () => {
  io.trkCerrar();
  await new Promise((r) => server.close(r));
  await cerrar();
});
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  jurado = await crearOperativo('TRK_JURADO');
  comentarista = await crearOperativo('TRK_COMENTARISTA');
  sockets = [];
});
afterEach(() => sockets.forEach((s) => s.close()));

function conectar(token) {
  return new Promise((resolve, reject) => {
    const s = cliente(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}
const esperar = (s, evento, ms = 2000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout ${evento}`)), ms);
  s.once(evento, (m) => { clearTimeout(t); resolve(m); });
});
const noRecibe = (s, evento, ms = 400) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  s.once(evento, () => { clearTimeout(t); reject(new Error(`no debía recibir ${evento}`)); });
});

test('§13.8 + HU-7 CA2: jurado, comentarista y pantalla reciben pasarela:cambio sin datos personales; admin con datos', async () => {
  const p = await crearParticipante({ mascota_nombre: 'Canela' });
  const [sJ, sC, sP, sA] = await Promise.all([conectar(jurado.token), conectar(comentarista.token), conectar(null), conectar(admin.token)]);
  const mensajes = Promise.all([sJ, sC, sP, sA].map((s) => esperar(s, 'pasarela:cambio')));
  const inicio = Date.now();
  await request(server).post(`/api/trk/v1/pasarela/${p.id}`).set('Authorization', `Bearer ${comentarista.token}`).expect(200);
  const [mJ, mC, mP, mA] = await mensajes;
  expect(Date.now() - inicio).toBeLessThan(2000);
  for (const m of [mJ, mC, mP]) {
    expect(m.participante).toMatchObject({ id: p.id, mascota_nombre: 'Canela', responsable_primer_nombre: 'Ana' });
    for (const campo of SENSIBLES) expect(m.participante).not.toHaveProperty(campo);
  }
  expect(mA.participante.responsable_telefono).toBe('3001234567');
});

test('token inválido → connect_error NO_AUTENTICADO', async () => {
  await expect(conectar('token-falso')).rejects.toThrow('NO_AUTENTICADO');
});

test('calificacion:recibida solo llega a la room admin', async () => {
  const [sA, sJ, sP] = await Promise.all([conectar(admin.token), conectar(jurado.token), conectar(null)]);
  const llegaAdmin = esperar(sA, 'calificacion:recibida');
  const noJurado = noRecibe(sJ, 'calificacion:recibida');
  const noPantalla = noRecibe(sP, 'calificacion:recibida');
  emitir('calificacion:recibida', { participante_id: 'x', jurado_id: 1, total: 80 }, { rooms: ['admin'] });
  await expect(llegaAdmin).resolves.toEqual({ participante_id: 'x', jurado_id: 1, total: 80 });
  await noJurado;
  await noPantalla;
});

// ---------- I3: reenvío fail-closed y filtrado por estado ----------
const fila = (extra = {}) => ({
  id: 'p-1', categoria_id: 1, mascota_nombre: 'Lola', estado: 'PRESENTE', fusionado_en_id: null,
  responsable_nombre: 'Marta Gómez', responsable_documento: '1004123456', responsable_telefono: '3009998877',
  responsable_correo: 'marta@x.co', categoria_propuesta_id: 2, notas_importacion: 'n', advertencias_importacion: ['a'],
  ...extra
});
const SIN_PII = /1004123456|3009998877|marta@x\.co|Gómez/;

test('I3: cualquier clave con una fila cruda llega a rooms PUBLICO sin responsable_* (a cualquier profundidad); admin la ve completa', async () => {
  const [sP, sJ, sA] = await Promise.all([conectar(null), conectar(jurado.token), conectar(admin.token)]);
  const llegan = Promise.all([sP, sJ, sA].map((s) => esperar(s, 'pasarela:cambio')));
  emitir('pasarela:cambio', { participante: fila({ estado: 'EN_PASARELA' }), destino: fila(), lista: [{ anidado: fila() }] });
  const [mP, mJ, mA] = await llegan;
  for (const m of [mP, mJ]) {
    expect(JSON.stringify(m)).not.toMatch(SIN_PII);
    expect(m.destino).not.toHaveProperty('responsable_documento');
    expect(m.destino).not.toHaveProperty('notas_importacion');
    expect(m.destino).not.toHaveProperty('categoria_propuesta_id');
    expect(m.lista[0].anidado).not.toHaveProperty('responsable_correo');
  }
  expect(mA.destino.responsable_documento).toBe('1004123456');
});

test('I3: participante no visible (INSCRITO/AUSENTE) → jurado y comentarista solo reciben {id, estado: OCULTO}; pantalla nada', async () => {
  const [sJ, sC, sP, sA] = await Promise.all([conectar(jurado.token), conectar(comentarista.token), conectar(null), conectar(admin.token)]);
  for (const estado of ['INSCRITO', 'AUSENTE']) {
    const llegan = Promise.all([sJ, sC, sA].map((s) => esperar(s, 'participante:actualizado')));
    const noPantalla = noRecibe(sP, 'participante:actualizado');
    emitir('participante:actualizado', { participante: fila({ estado }) });
    const [mJ, mC, mA] = await llegan;
    expect(mJ).toEqual({ participante: { id: 'p-1', estado: 'OCULTO' } });
    expect(mC).toEqual({ participante: { id: 'p-1', estado: 'OCULTO' } });
    expect(mA.participante).toMatchObject({ id: 'p-1', estado, responsable_telefono: '3009998877' });
    await noPantalla;
  }
});

test('I3: foto:nueva de un participante no visible no llega a rooms PUBLICO', async () => {
  const [sJ, sP, sA] = await Promise.all([conectar(jurado.token), conectar(null), conectar(admin.token)]);
  const noJ = noRecibe(sJ, 'foto:nueva');
  const noP = noRecibe(sP, 'foto:nueva');
  const llegaA = esperar(sA, 'foto:nueva');
  emitir('foto:nueva', { participante: fila({ estado: 'INSCRITO' }) });
  await expect(llegaA).resolves.toHaveProperty('participante.id', 'p-1');
  await noJ;
  await noP;
});

test('I3: pantalla no recibe participante:actualizado aunque el participante sea visible', async () => {
  const [sJ, sP] = await Promise.all([conectar(jurado.token), conectar(null)]);
  const llegaJ = esperar(sJ, 'participante:actualizado');
  const noP = noRecibe(sP, 'participante:actualizado');
  emitir('participante:actualizado', { participante: fila() });
  await expect(llegaJ).resolves.toHaveProperty('participante.mascota_nombre', 'Lola');
  await noP;
});

test('I3 + HU-3 CA2: origen fusionado → admin y cabina ven fusionado_en_id; jurado lo recibe como OCULTO', async () => {
  const cabina = await crearOperativo('TRK_CABINA');
  const [sA, sCab, sJ] = await Promise.all([conectar(admin.token), conectar(cabina.token), conectar(jurado.token)]);
  const llegan = Promise.all([sA, sCab, sJ].map((s) => esperar(s, 'participante:actualizado')));
  emitir('participante:actualizado', { participante: fila({ estado: 'PRESENTADO', fusionado_en_id: 'p-2' }) });
  const [mA, mCab, mJ] = await llegan;
  expect(mA.participante.fusionado_en_id).toBe('p-2');
  expect(mCab.participante).toMatchObject({ fusionado_en_id: 'p-2', responsable_documento: '1004123456' });
  expect(mJ).toEqual({ participante: { id: 'p-1', estado: 'OCULTO' } });
});

test('M3: si serializar falla, emitir() no lanza al servicio (el error se registra)', () => {
  const malo = { get: () => { throw new Error('fila rota'); } };
  expect(() => emitir('participante:actualizado', { participante: malo })).not.toThrow();
});

// ---------- I4: revocación de sesiones de socket ----------
const desconecta = (s, ms = 2000) => new Promise((resolve, reject) => {
  if (s.disconnected) return resolve();
  const t = setTimeout(() => reject(new Error('el socket sigue conectado')), ms);
  s.once('disconnect', () => { clearTimeout(t); resolve(); });
});

test('I4: regenerar el PIN desconecta los sockets de ese usuario (no los de otros)', async () => {
  const cabina = await crearOperativo('TRK_CABINA');
  const [sCab, sJ] = await Promise.all([conectar(cabina.token), conectar(jurado.token)]);
  const cae = desconecta(sCab);
  await request(server).post(`/api/trk/v1/usuarios/${cabina.usuario.id}/pin`).set('Authorization', `Bearer ${admin.token}`).expect(200);
  await cae;
  expect(sJ.connected).toBe(true);
});

test('I4: desactivar al usuario desconecta sus sockets', async () => {
  const [sJ] = await Promise.all([conectar(jurado.token)]);
  const cae = desconecta(sJ);
  await request(server).patch(`/api/trk/v1/usuarios/${jurado.usuario.id}`).set('Authorization', `Bearer ${admin.token}`).send({ activo: false }).expect(200);
  await cae;
});

test('I4: el socket se cierra cuando vence el token', async () => {
  const jwt = require('jsonwebtoken');
  const corto = jwt.sign({ id: jurado.usuario.id, scope: 'trk', tv: 0 }, process.env.TRK_JWT_SECRET, { expiresIn: 1 });
  const s = await conectar(corto);
  await desconecta(s, 3000);
});
