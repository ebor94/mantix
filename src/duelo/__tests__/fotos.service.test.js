const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { crearServicioFotos, esHeic, MENSAJE_FOTO, MENSAJE_FOTO_GRANDE } = require('../services/fotos.service');
const {
  jpg, png, webp, jpgOrientacion6, jpgConExif, heicFalso, heicIlegible,
} = require('../testing/imagenes');

let dir; let logger;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-fotos-'));
  logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const servicio = (extra = {}) => crearServicioFotos({ dir: () => path.join(dir, 'fotos'), logger, ...extra });

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
  expect(esHeic(await heicFalso())).toBe(true);
  expect(esHeic(heicIlegible())).toBe(true);
  expect(esHeic(await jpg())).toBe(false);
  const salida = await servicio({ convertirHeic }).procesar(await heicFalso());
  expect(convertirHeic).toHaveBeenCalledTimes(1);
  expect((await sharp(salida).metadata()).width).toBe(50);
});

test('HEIC que no se puede convertir se rechaza con el mismo mensaje', async () => {
  const convertirHeic = jest.fn(async () => { throw new Error('dañado'); });
  await expect(servicio({ convertirHeic }).procesar(await heicFalso()))
    .rejects.toMatchObject({ motivo: 'FOTO_INVALIDA' });
});

describe('límite de 50 megapíxeles antes de decodificar', () => {
  test('una imagen de 9000x6000 (54 MP) se rechaza con un mensaje amable', async () => {
    await expect(servicio().procesar(await png(9000, 6000)))
      .rejects.toMatchObject({ statusCode: 422, motivo: 'FOTO_INVALIDA', message: MENSAJE_FOTO_GRANDE });
    expect(MENSAJE_FOTO_GRANDE).toBe('Esta foto es demasiado grande. Elige una de menor resolución.');
  });

  test('una de 8064x6048 (48 MP, cámara de iPhone) pasa', async () => {
    const salida = await sharp(await servicio().procesar(await jpg(8064, 6048))).metadata();
    expect([salida.width, salida.height]).toEqual([2000, 1500]);
  });

  test('un HEIC de 54 MP se rechaza sin llegar a convertirlo', async () => {
    const convertirHeic = jest.fn();
    await expect(servicio({ convertirHeic }).procesar(await heicFalso(9000, 6000)))
      .rejects.toMatchObject({ motivo: 'FOTO_INVALIDA', message: MENSAJE_FOTO_GRANDE });
    expect(convertirHeic).not.toHaveBeenCalled();
  });

  test('un HEIC cuya cabecera no se puede leer se rechaza sin convertirlo', async () => {
    const convertirHeic = jest.fn();
    await expect(servicio({ convertirHeic }).procesar(heicIlegible()))
      .rejects.toMatchObject({ motivo: 'FOTO_INVALIDA', message: MENSAJE_FOTO });
    expect(convertirHeic).not.toHaveBeenCalled();
  });

  test('si el HEIC convertido resulta más grande que el límite, también se rechaza', async () => {
    const convertirHeic = jest.fn(async () => png(9000, 6000));
    await expect(servicio({ convertirHeic }).procesar(await heicFalso()))
      .rejects.toMatchObject({ motivo: 'FOTO_INVALIDA' });
  });
});

describe('registro de fallos sin datos personales', () => {
  test('un fallo interno sigue siendo 422 para el usuario y deja una línea con nombre, código, HEIC y bytes', async () => {
    const entrada = await heicFalso();
    const fallo = Object.assign(new Error("Cannot find module 'heic-convert' en /home/ana/foto.heic"),
      { code: 'MODULE_NOT_FOUND' });
    await expect(servicio({ convertirHeic: async () => { throw fallo; } }).procesar(entrada))
      .rejects.toMatchObject({ statusCode: 422, motivo: 'FOTO_INVALIDA', message: MENSAJE_FOTO });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual({
      nombre: 'Error', codigo: 'MODULE_NOT_FOUND', heic: true, bytes: entrada.length,
    });
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/ana|foto\.heic|Cannot find/);
  });

  test('un archivo que no es imagen también se registra, sin su contenido', async () => {
    const entrada = Buffer.from('%PDF-1.7 cédula 1090000001');
    await expect(servicio().procesar(entrada)).rejects.toMatchObject({ motivo: 'FOTO_INVALIDA' });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toMatchObject({ heic: false, bytes: entrada.length });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('1090000001');
  });

  test('el rechazo deliberado por tamaño no se registra como fallo', async () => {
    await expect(servicio().procesar(await png(9000, 6000))).rejects.toMatchObject({ motivo: 'FOTO_INVALIDA' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('una foto válida no registra nada', async () => {
    await servicio().procesar(await jpg());
    expect(logger.error).not.toHaveBeenCalled();
  });
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
