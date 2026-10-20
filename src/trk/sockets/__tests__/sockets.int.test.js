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
