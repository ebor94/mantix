const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
const CSV = path.join(__dirname, '..', '..', 'testing', 'fixtures', 'inscripciones-anonimizadas.csv');
let admin;

beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
});
afterAll(cerrar);

const preview = () => request(servidor).post('/api/trk/v1/import/preview')
  .set('Authorization', `Bearer ${admin.token}`)
  .attach('archivo', fs.readFileSync(CSV), 'inscripciones.csv');
const confirmar = (token, decisiones = {}) => request(servidor).post('/api/trk/v1/import/confirm')
  .set('Authorization', `Bearer ${admin.token}`)
  .send({ preview_token: token, decisiones });

test('TRK-IMP-001 vista previa: devuelve filas y no guarda nada (CA2)', async () => {
  const r = await preview();
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-IMP-001');
  expect(r.body.data.preview_token).toMatch(/^[a-f0-9]{64}$/);
  expect(r.body.data.resumen.total).toBe(9);
  expect(await db.TrkParticipante.count()).toBe(0);
});

test('TRK-IMP-002 confirma con decisiones por defecto: 8 creados (duplicado conserva la primera)', async () => {
  const token = (await preview()).body.data.preview_token;
  const r = await confirmar(token);
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({ creados: 8, actualizados: 0, omitidos: 1 });
  const thor = await db.TrkParticipante.findAll({ where: { mascota_nombre_norm: 'thor' }, include: ['categoria'] });
  expect(thor.map((t) => t.categoria.codigo)).toEqual(['GRANDES']);
  const max = await db.TrkParticipante.findOne({ where: { mascota_nombre: 'Max' } });
  expect(max).toMatchObject({ estado: 'INSCRITO', origen: 'IMPORTACION', notas_importacion: 'confirmar si es uno o dos y categoría | validar en cual categoría ira' });
  expect(max.advertencias_importacion.map((a) => a.codigo)).toContain('NOTA_IMPORTACION');
  expect(await db.TrkImportacion.count()).toBe(1);
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-IMP-002', accion: 'IMPORTAR' } })).toBe(1);
});

test('decisiones: conservar otra fila del grupo, aceptar sugerencia y omitir filas', async () => {
  const token = (await preview()).body.data.preview_token;
  const r = await confirmar(token, { conservar: { 'dup-1': 4 }, categoria: { 1: 'PEQ_MED' }, omitir: [5] });
  expect(r.body.data).toEqual({ creados: 7, actualizados: 0, omitidos: 2 });
  const thor = await db.TrkParticipante.findOne({ where: { mascota_nombre_norm: 'thor' }, include: ['categoria'] });
  expect(thor.categoria.codigo).toBe('FAMILIAR');
  const rocky = await db.TrkParticipante.findOne({ where: { mascota_nombre: 'Rocky' }, include: ['categoria'] });
  expect(rocky.categoria.codigo).toBe('PEQ_MED');
  expect(await db.TrkParticipante.count({ where: { mascota_nombre_norm: { [db.Sequelize.Op.like]: 'trompis%' } } })).toBe(0);
});

test('§13.9 importar dos veces el mismo CSV → cero duplicados', async () => {
  await confirmar((await preview()).body.data.preview_token);
  const r = await confirmar((await preview()).body.data.preview_token);
  expect(r.body.data).toEqual({ creados: 0, actualizados: 8, omitidos: 1 });
  expect(await db.TrkParticipante.count()).toBe(8);
});

test('CA3: al reimportar solo se llenan campos vacíos; foto oficial y estado intactos', async () => {
  const existente = await crearParticipante({
    mascota_nombre: 'Canela', responsable_documento: '1234567890', responsable_nombre: 'Laura Gómez Ruiz',
    raza: 'Raza previa', disfraz_nombre: null, foto_oficial_path: 'previa.jpg', estado: 'PRESENTE'
  });
  await confirmar((await preview()).body.data.preview_token);
  await existente.reload();
  expect(existente.raza).toBe('Raza previa');
  expect(existente.disfraz_nombre).toBe('Bruja de Oz');
  expect(existente.foto_oficial_path).toBe('previa.jpg');
  expect(existente.estado).toBe('PRESENTE');
});

test('token desconocido o vencido → 409 PREVIEW_VENCIDO', async () => {
  const r = await confirmar('a'.repeat(64));
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ error: 'TRK-IMP-002', motivo: 'PREVIEW_VENCIDO' });
});

test('categoría decidida inexistente → 400', async () => {
  const token = (await preview()).body.data.preview_token;
  const r = await confirmar(token, { categoria: { 0: 'NO_EXISTE' } });
  expect(r.status).toBe(400);
  expect(await db.TrkParticipante.count()).toBe(0);
});

test('sin archivo → 400; sin permiso importar → 403', async () => {
  const sinArchivo = await request(servidor).post('/api/trk/v1/import/preview').set('Authorization', `Bearer ${admin.token}`);
  expect(sinArchivo.status).toBe(400);
  const cabina = await crearOperativo('TRK_CABINA');
  const r = await request(servidor).post('/api/trk/v1/import/preview').set('Authorization', `Bearer ${cabina.token}`).attach('archivo', fs.readFileSync(CSV), 'x.csv');
  expect(r.status).toBe(403);
});
