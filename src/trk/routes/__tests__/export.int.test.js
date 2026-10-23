const ExcelJS = require('exceljs');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, calificar, criteriosDe } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(limpiar);
afterAll(cerrar);

const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

test('TRK-EXP-001 genera Excel con hoja por categoría y detalle por jurado y criterio (HU-4 CA3)', async () => {
  const admin = await crearAdmin();
  const j = await crearOperativo('TRK_JURADO', { nombre: 'Jurado Ana' });
  const p = await crearParticipante({ mascota_nombre: 'Canela', estado: 'PRESENTADO', responsable_telefono: '3009990000' });
  await calificar(p, j.usuario, { CREATIVIDAD: 40, BIENESTAR: 25, PASARELA: 15 });

  const r = await request(servidor).get('/api/trk/v1/export/resultados.xlsx').set('Authorization', `Bearer ${admin.token}`).buffer(true).parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-EXP-001');
  expect(r.headers['content-type']).toContain('spreadsheetml');
  expect(r.headers['content-disposition']).toMatch(/attachment; filename="trikipeludos-resultados-\d{8}-\d{4}\.xlsx"/);

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.body);
  expect(libro.worksheets.map((h) => h.name)).toEqual(['PEQUENOS', 'MEDIANOS', 'GRANDES', 'FELINOS', 'FAMILIAR', 'Detalle']);
  const peq = libro.getWorksheet('PEQUENOS');
  expect(peq.getRow(1).values).toEqual(expect.arrayContaining(['Puesto', 'Mascota', 'Puntaje final', 'Creatividad']));
  expect(peq.getRow(2).getCell(2).value).toBe('Canela');
  const detalle = libro.getWorksheet('Detalle');
  expect(detalle.rowCount - 1).toBe((await criteriosDe(p)).length);
  expect(detalle.getRow(2).values).toEqual(expect.arrayContaining(['Canela', 'Jurado Ana']));

  let todo = '';
  libro.eachSheet((h) => h.eachRow((fila) => { todo += JSON.stringify(fila.values); }));
  expect(todo).not.toContain('3009990000');
});

test('solo con permiso exportar', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const r = await request(servidor).get('/api/trk/v1/export/resultados.xlsx').set('Authorization', `Bearer ${jurado.token}`);
  expect(r.status).toBe(403);
});
