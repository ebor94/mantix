const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const TrkError = require('../utils/TrkError');

const LADO_MAXIMO = 1600;

const dirFotos = () => process.env.TRK_FOTOS_PATH || path.join(process.cwd(), 'uploads', 'trk', 'fotos');

// Normaliza en servidor aunque el cliente ya comprima: orientación, tamaño, sin EXIF/GPS (RNF-5).
async function procesarYGuardarFoto(buffer) {
  const dir = dirFotos();
  fs.mkdirSync(dir, { recursive: true });
  const nombre = `${crypto.randomUUID()}.jpg`;
  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(dir, nombre));
  } catch (e) {
    throw new TrkError(400, 'VALIDACION', 'La imagen no se pudo procesar');
  }
  return nombre;
}

module.exports = { dirFotos, procesarYGuardarFoto };
