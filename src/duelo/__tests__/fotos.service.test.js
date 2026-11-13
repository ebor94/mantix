const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { crearServicioFotos, esHeic, MENSAJE_FOTO } = require('../services/fotos.service');
const { jpg, png, webp, jpgOrientacion6, jpgConExif, heicFalso } = require('../testing/imagenes');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-fotos-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const servicio = (extra = {}) => crearServicioFotos({ dir: () => path.join(dir, 'fotos'), ...extra });

test('convierte PNG a JPG', async () => {
  const salida = await servicio().procesar(await png());
  expect((await sharp(salida).metadata()).format).toBe('jpeg');
});

test('convierte WebP a JPG', async () => {
  const salida = await servicio().procesar(await webp());
  expect((await sharp(salida).metadata()).format).toBe('jpeg');
});

test('aplica la orientación EXIF: un JPG 40x30 con orientación 6 sale de 30x40', async () => {
  const entrada = await jpgOrientacion6();
  const original = await sharp(entrada).metadata();
  expect([original.width, original.height, original.orientation]).toEqual([40, 30, 6]);
  const salida = await sharp(await servicio().procesar(entrada)).metadata();
  expect([salida.width, salida.height]).toEqual([30, 40]);
  expect(salida.orientation).toBeUndefined();
});

test('limita el lado mayor a 2000 px sin agrandar', async () => {
  const grande = await sharp(await servicio().procesar(await jpg(3000, 1500))).metadata();
  expect([grande.width, grande.height]).toEqual([2000, 1000]);
  const chica = await sharp(await servicio().procesar(await jpg(40, 30))).metadata();
  expect([chica.width, chica.height]).toEqual([40, 30]);
});

test('elimina los metadatos EXIF (incluida la ubicación)', async () => {
  const entrada = await jpgConExif();
  expect((await sharp(entrada).metadata()).exif).toBeDefined();
  const salida = await servicio().procesar(entrada);
  expect((await sharp(salida).metadata()).exif).toBeUndefined();
});

test('rechaza un archivo que no es imagen', async () => {
  await expect(servicio().procesar(Buffer.from('%PDF-1.7 no soy una foto')))
    .rejects.toMatchObject({ statusCode: 422, motivo: 'FOTO_INVALIDA', message: MENSAJE_FOTO });
});

test('detecta HEIC por contenido y lo convierte antes de Sharp', async () => {
  const convertido = await jpg(50, 50);
  const convertirHeic = jest.fn(async () => convertido);
  expect(esHeic(heicFalso())).toBe(true);
  expect(esHeic(await jpg())).toBe(false);
  const salida = await servicio({ convertirHeic }).procesar(heicFalso());
  expect(convertirHeic).toHaveBeenCalledTimes(1);
  expect((await sharp(salida).metadata()).width).toBe(50);
});

test('HEIC que no se puede convertir se rechaza con el mismo mensaje', async () => {
  const convertirHeic = jest.fn(async () => { throw new Error('dañado'); });
  await expect(servicio({ convertirHeic }).procesar(heicFalso()))
    .rejects.toMatchObject({ motivo: 'FOTO_INVALIDA' });
});

test('guardar crea la carpeta, usa nombre UUID y borrar lo elimina', async () => {
  const s = servicio();
  const datos = await jpg();
  const { nombre, bytes } = await s.guardar(datos);
  expect(nombre).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  expect(bytes).toBe(datos.length);
  expect(fs.existsSync(s.ruta(nombre))).toBe(true);
  await s.borrar([nombre, 'no-existe.jpg']);
  expect(fs.existsSync(s.ruta(nombre))).toBe(false);
});

test('ruta rechaza nombres que no son UUID.jpg', () => {
  expect(servicio().ruta('../../etc/passwd')).toBeNull();
  expect(servicio().ruta('foto.jpg')).toBeNull();
});
