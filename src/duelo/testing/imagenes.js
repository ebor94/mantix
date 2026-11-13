// Imágenes mínimas generadas con Sharp para las pruebas (no hay archivos binarios en el repo).
const sharp = require('sharp');

const lienzo = (ancho, alto) => sharp({
  create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 120, b: 60 } },
});

const jpg = (ancho = 40, alto = 30) => lienzo(ancho, alto).jpeg().toBuffer();
const png = (ancho = 40, alto = 30) => lienzo(ancho, alto).png().toBuffer();
const webp = (ancho = 40, alto = 30) => lienzo(ancho, alto).webp().toBuffer();
/** JPG de 40x30 que declara orientación EXIF 6 (hay que girarlo 90° para verlo derecho). */
const jpgOrientacion6 = () => lienzo(40, 30).jpeg().withMetadata({ orientation: 6 }).toBuffer();
const jpgConExif = () => lienzo(40, 30).jpeg()
  .withExif({ IFD0: { Copyright: 'Prueba' }, IFD3: { GPSLatitudeRef: 'N' } }).toBuffer();

/** Cabecera ISO-BMFF con marca `heic` y nada más: se detecta como HEIC pero no se puede leer. */
const heicIlegible = () => Buffer.concat([
  Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(12),
]);

/**
 * HEIF con marca `heic` cuya cabecera Sharp sí lee (un AVIF de 64x48 re-etiquetado). La caja `ispe`
 * se reescribe para declarar `ancho`x`alto` sin codificar esos píxeles. No es decodificable por
 * heic-convert: las pruebas lo combinan con un `convertirHeic` falso.
 */
async function heicFalso(ancho = 64, alto = 48) {
  const avif = await lienzo(64, 48).heif({ compression: 'av1' }).toBuffer();
  const heic = Buffer.from(avif);
  heic.write('heic', 8, 'latin1');
  const ispe = heic.indexOf('ispe', 0, 'latin1');
  heic.writeUInt32BE(ancho, ispe + 8);
  heic.writeUInt32BE(alto, ispe + 12);
  return heic;
}

module.exports = { jpg, png, webp, jpgOrientacion6, jpgConExif, heicFalso, heicIlegible };
