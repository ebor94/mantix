// Normaliza y guarda las fotos de los compañeros. Toda imagen se reprocesa con Sharp: orientación,
// tamaño, sin metadatos (EXIF/GPS) y siempre JPG. Las fotos viven fuera de uploads/ (que es público).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const DueloError = require('../utils/DueloError');

const LADO_MAXIMO = 2000;
const FORMATOS = ['jpeg', 'png', 'webp'];
const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const NOMBRE_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const MENSAJE_FOTO = 'No pudimos leer esta foto. Intenta con otra, en formato JPG o PNG.';

/** HEIC/HEIF por contenido: caja `ftyp` con una marca de la familia HEIF. */
function esHeic(buffer) {
  return buffer.length >= 12
    && buffer.toString('latin1', 4, 8) === 'ftyp'
    && MARCAS_HEIC.has(buffer.toString('latin1', 8, 12));
}

// Los binarios precompilados de Sharp no decodifican HEVC; heic-convert lo hace en JavaScript.
async function convertirHeicReal(buffer) {
  const convertir = require('heic-convert');
  return Buffer.from(await convertir({ buffer, format: 'JPEG', quality: 0.92 }));
}

function crearServicioFotos({ dir, convertirHeic = convertirHeicReal }) {
  async function procesar(buffer) {
    try {
      const entrada = esHeic(buffer) ? await convertirHeic(buffer) : buffer;
      const { format } = await sharp(entrada).metadata();
      if (!FORMATOS.includes(format)) throw new Error('formato no admitido');
      return await sharp(entrada)
        .rotate()
        .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
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

module.exports = { crearServicioFotos, esHeic, MENSAJE_FOTO };
