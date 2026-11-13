// Normaliza y guarda las fotos de los compañeros. Toda imagen se reprocesa con Sharp: orientación,
// tamaño, sin metadatos (EXIF/GPS) y siempre JPG. Las fotos viven fuera de uploads/ (que es público).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const loggerMantix = require('../../utils/logger');
const DueloError = require('../utils/DueloError');
const { crearConvertidorHeic } = require('./convertidorHeic');

const LADO_MAXIMO = 2000;
// Las fotos de 48 MP del iPhone deben pasar; por encima de esto ni se decodifican.
const MAX_PIXELES = 50_000_000;
const FORMATOS = ['jpeg', 'png', 'webp'];
const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const NOMBRE_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const MENSAJE_FOTO = 'No pudimos leer esta foto. Intenta con otra, en formato JPG o PNG.';
const MENSAJE_FOTO_GRANDE = 'Esta foto es demasiado grande. Elige una de menor resolución.';

/** HEIC/HEIF por contenido: caja `ftyp` con una marca de la familia HEIF. */
function esHeic(buffer) {
  return buffer.length >= 12
    && buffer.toString('latin1', 4, 8) === 'ftyp'
    && MARCAS_HEIC.has(buffer.toString('latin1', 8, 12));
}

/** Lee solo la cabecera (no decodifica): sirve también para HEIC aunque Sharp no sepa decodificar HEVC. */
async function verificarDimensiones(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  if (!(width > 0 && height > 0)) throw new Error('dimensiones ilegibles');
  if (width * height > MAX_PIXELES) throw new DueloError(422, 'FOTO_INVALIDA', MENSAJE_FOTO_GRANDE);
}

// Los binarios precompilados de Sharp no decodifican HEVC; heic-convert lo hace en JavaScript, en un
// worker aparte para no congelar el proceso compartido de Mantix (ver convertidorHeic.js).
function crearServicioFotos({ dir, convertirHeic = crearConvertidorHeic(), logger = loggerMantix }) {
  async function procesar(buffer) {
    const heic = esHeic(buffer);
    try {
      await verificarDimensiones(buffer);
      const entrada = heic ? await convertirHeic(buffer) : buffer;
      const opciones = { limitInputPixels: MAX_PIXELES };
      const { format } = await sharp(entrada, opciones).metadata();
      if (!FORMATOS.includes(format)) throw new Error('formato no admitido');
      return await sharp(entrada, opciones)
        .rotate()
        .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      if (err instanceof DueloError) throw err;
      // El usuario solo ve el 422; aquí queda la causa sin contenido ni nombre del archivo.
      logger.error('duelo: no se pudo procesar una foto', {
        nombre: err && err.name, codigo: err && err.code, heic, bytes: buffer.length,
      });
      throw new DueloError(422, 'FOTO_INVALIDA', MENSAJE_FOTO);
    }
  }

  async function guardar(jpg) {
    await fs.promises.mkdir(dir(), { recursive: true });
    const nombre = `${crypto.randomUUID()}.jpg`;
    await fs.promises.writeFile(path.join(dir(), nombre), jpg);
    return { nombre, bytes: jpg.length };
  }

  async function borrar(nombres) {
    await Promise.all(nombres.map((nombre) => {
      const destino = ruta(nombre);
      return destino ? fs.promises.unlink(destino).catch(() => {}) : null;
    }));
  }

  function ruta(nombre) {
    return NOMBRE_VALIDO.test(nombre) ? path.join(dir(), nombre) : null;
  }

  return { procesar, guardar, borrar, ruta };
}

module.exports = {
  crearServicioFotos, esHeic, MENSAJE_FOTO, MENSAJE_FOTO_GRANDE, MAX_PIXELES,
};
