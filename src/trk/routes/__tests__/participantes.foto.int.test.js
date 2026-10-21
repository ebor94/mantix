const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const { bus } = require('../../sockets/bus');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante } = require('../../testing/fabricas');
const db = require('../../../models');
const { dirFotos } = require('../../services/fotos.service');

const app = crearAppTrk({ estaticos: true });
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
let cabina; let eventos;
const escuchar = (e) => eventos.push(e.evento);

beforeEach(async () => {
  await limpiar();
  cabina = await crearOperativo('TRK_CABINA');
  eventos = [];
  bus.on('trk', escuchar);
});
afterEach(() => bus.off('trk', escuchar));
afterAll(cerrar);

const imagen = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#E8711A' } })
  .withMetadata({ exif: { IFD0: { Make: 'CamaraFicticia' } } })
  .jpeg()
  .toBuffer();

const subir = (id, buffer, nombre = 'foto.jpg') => request(servidor)
  .post(`/api/trk/v1/participantes/${id}/foto`)
  .set('Authorization', `Bearer ${cabina.token}`)
  .attach('foto', buffer, nombre);

test('TRK-PAR-005 guarda foto con UUID, ≤1600 px, sin EXIF, y marca PRESENTE con orden de llegada', async () => {
  await crearParticipante({ estado: 'PRESENTE', orden_pasarela: 4 });
  const p = await crearParticipante({ estado: 'INSCRITO' });
  const r = await subir(p.id, await imagen(2400, 3000));
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-PAR-005');
  expect(r.body.data).toMatchObject({ estado: 'PRESENTE', orden_pasarela: 5 });
  expect(r.body.data.llegada_at).toEqual(expect.any(String));
  expect(r.body.data.foto_url).toMatch(/^\/uploads\/trk\/fotos\/[0-9a-f-]{36}\.jpg$/);

  const archivo = path.join(dirFotos(), path.basename(r.body.data.foto_url));
  const meta = await sharp(fs.readFileSync(archivo)).metadata();
  expect(Math.max(meta.width, meta.height)).toBe(1600);
  expect(meta.exif).toBeUndefined();
  expect(eventos).toEqual(expect.arrayContaining(['foto:nueva', 'participante:actualizado']));

  const estatico = await request(servidor).get(r.body.data.foto_url);
  expect(estatico.status).toBe(200);
});

test('repetir la foto no cambia el estado de quien ya está en pasarela', async () => {
  const p = await crearParticipante({ estado: 'EN_PASARELA', foto_oficial_path: 'vieja.jpg' });
  const r = await subir(p.id, await imagen(800, 1000));
  expect(r.body.data.estado).toBe('EN_PASARELA');
  expect(r.body.data.foto_url).not.toContain('vieja.jpg');
});

test('archivo que no es imagen → 400', async () => {
  const p = await crearParticipante();
  const r = await subir(p.id, Buffer.from('no soy imagen'), 'x.txt');
  expect(r.status).toBe(400);
  expect(r.body.motivo).toBe('VALIDACION');
});

test('sin archivo → 400', async () => {
  const p = await crearParticipante();
  const r = await request(servidor).post(`/api/trk/v1/participantes/${p.id}/foto`).set('Authorization', `Bearer ${cabina.token}`);
  expect(r.status).toBe(400);
});

test('participante inexistente → 404 sin dejar archivos huérfanos', async () => {
  fs.mkdirSync(dirFotos(), { recursive: true });
  const antes = fs.readdirSync(dirFotos()).length;
  const r = await subir('00000000-0000-4000-8000-000000000000', await imagen(800, 1000));
  expect(r.status).toBe(404);
  expect(fs.readdirSync(dirFotos()).length).toBe(antes);
});

test('fotos concurrentes en la misma categoría reciben órdenes de pasarela distintos', async () => {
  const ps = [];
  for (let i = 0; i < 4; i += 1) ps.push(await crearParticipante({ estado: 'INSCRITO' }));
  const buf = await imagen(600, 800);
  const rs = await Promise.all(ps.map((p) => subir(p.id, buf)));
  rs.forEach((r) => expect(r.status).toBe(200));
  const ordenes = rs.map((r) => r.body.data.orden_pasarela);
  expect(new Set(ordenes).size).toBe(4);
  ordenes.forEach((o) => expect(Number.isInteger(o)).toBe(true));
});

test('la auditoría FOTO_OFICIAL guarda el estado y la foto previos', async () => {
  const p = await crearParticipante({ estado: 'INSCRITO' });
  const r1 = await subir(p.id, await imagen(600, 800));
  const primera = path.basename(r1.body.data.foto_url);
  await subir(p.id, await imagen(600, 800));
  const fila = await db.TrkAuditoria.findOne({ where: { accion: 'FOTO_OFICIAL', entidad_id: String(p.id) }, order: [['id', 'DESC']] });
  expect(fila.antes.foto_oficial_path).toBe(primera);
  expect(fila.antes.estado).toBe('PRESENTE');
});
