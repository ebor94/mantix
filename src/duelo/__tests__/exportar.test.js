const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip'); // dependencia de exceljs; solo se usa para leer el ZIP en la prueba
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, CONFIG } = require('../testing/appPrueba');
const { firmarToken } = require('../middleware/autenticacion');

afterEach(cerrarServidores);

const token = () => `Bearer ${firmarToken(CONFIG)}`;
const binario = (res, fin) => {
  const trozos = [];
  res.on('data', (t) => trozos.push(t));
  res.on('end', () => fin(null, Buffer.concat(trozos)));
};

const INSCRIPCIONES = [{
  id: 2, nombre_completo: 'Luis Gómez', cedula: '0090000002', celular: '3009999999', correo: 'luis@correo.com',
  honra_companero: true, correo_enviado: false, utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'taller',
  utm_content: null, created_at: new Date('2026-11-14T10:30:00-05:00'),
  companeros: [{ id: 1, orden: 1, nombre: 'Luna' }, { id: 2, orden: 2, nombre: 'Max' }],
}];

test('exportar.xlsx: una fila por inscripción con los compañeros en columnas', async () => {
  const { app, deps } = crearAppPrueba();
  deps.repo.listar.mockResolvedValue({ inscripciones: INSCRIPCIONES, totales: {} });
  const r = await request(await servir(app)).get('/api/duelo/v1/panel/exportar.xlsx')
    .set('Authorization', token()).buffer().parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['content-disposition']).toBe('attachment; filename="inscritos-taller-duelo-animal.xlsx"');

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.body);
  const hoja = libro.getWorksheet('Inscritos');
  expect(hoja.getRow(1).values.slice(1)).toEqual([
    'Nombre completo', 'Cédula', 'Celular', 'Correo', 'Honra a un compañero', 'Compañero 1', 'Compañero 2',
    'Compañero 3', 'Correo enviado', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'Fecha de inscripción',
  ]);
  const fila = hoja.getRow(2).values.slice(1);
  expect(fila.slice(0, 9)).toEqual(['Luis Gómez', '0090000002', '3009999999', 'luis@correo.com', 'Sí', 'Luna', 'Max', undefined, 'No']);
  expect(hoja.getCell('B2').type).toBe(ExcelJS.ValueType.String);
  expect(hoja.getCell('B2').value).toBe('0090000002');
  // La fecha va como texto en hora de Colombia, sin depender de la zona del servidor.
  expect(hoja.getCell('N2').type).toBe(ExcelJS.ValueType.String);
  expect(hoja.getCell('N2').value).toBe('2026-11-14 10:30');
});

test('fotos.zip: nombra cada foto y omite las que no están en disco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-zip-'));
  fs.writeFileSync(path.join(dir, 'a.jpg'), 'foto-de-luna');
  const { app, deps } = crearAppPrueba();
  deps.repo.fotosParaZip.mockResolvedValue([
    { cedula: '1090000002', orden: 1, nombre: 'Luna', foto_ruta: 'a.jpg' },
    { cedula: '1090000002', orden: 2, nombre: 'Max', foto_ruta: 'perdida.jpg' },
  ]);
  deps.fotos.ruta.mockImplementation((nombre) => path.join(dir, nombre));

  const r = await request(await servir(app)).get('/api/duelo/v1/panel/fotos.zip')
    .set('Authorization', token()).buffer().parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toBe('application/zip');

  const zip = await JSZip.loadAsync(r.body);
  expect(Object.keys(zip.files)).toEqual(['1090000002_1_luna.jpg']);
  expect(await zip.file('1090000002_1_luna.jpg').async('string')).toBe('foto-de-luna');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('las exportaciones exigen token', async () => {
  const { app } = crearAppPrueba();
  const servidor = await servir(app);
  expect((await request(servidor).get('/api/duelo/v1/panel/exportar.xlsx')).status).toBe(401);
  expect((await request(servidor).get('/api/duelo/v1/panel/fotos.zip')).status).toBe(401);
});

describe('escribirZip cuando el cliente corta la descarga', () => {
  const { Writable } = require('stream');
  const crypto = require('crypto');
  const Archiver = require('archiver/lib/core');
  const { escribirZip } = require('../services/exportar.service');

  test('termina la promesa y aborta el ZIP (no deja archivos abiertos)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-zip-corte-'));
    const entradas = [1, 2, 3, 4].map((n) => {
      const ruta = path.join(dir, `${n}.jpg`);
      fs.writeFileSync(ruta, crypto.randomBytes(2 * 1024 * 1024));
      return { ruta, nombre: `${n}.jpg` };
    });
    const abortar = jest.spyOn(Archiver.prototype, 'abort');
    // Simula al navegador que cierra la conexión con la descarga a medias.
    const salida = new Writable({ write(trozo, cod, listo) { listo(); this.destroy(); } });

    const resultado = await Promise.race([
      escribirZip(salida, entradas).then(() => 'terminó', () => 'terminó'),
      new Promise((ok) => { setTimeout(() => ok('colgada'), 2000); }),
    ]);
    expect(resultado).toBe('terminó');
    expect(abortar).toHaveBeenCalledTimes(1);
    abortar.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
