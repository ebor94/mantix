// Imágenes mínimas generadas con Sharp para las pruebas (no hay archivos binarios en el repo).
const sharp = require('sharp');

const lienzo = (ancho, alto) => sharp({
  create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 120, b: 60 } },
});

const jpg = (ancho = 40, alto = 30) => lienzo(ancho, alto).jpeg().toBuffer();
const png = (ancho = 40, alto = 30) => lienzo(ancho, alto).png().toBuffer();
const jpgConExif = () => lienzo(40, 30).jpeg()
  .withExif({ IFD0: { Copyright: 'Prueba' }, IFD3: { GPSLatitudeRef: 'N' } }).toBuffer();

/** Cabecera ISO-BMFF con marca `heic`: basta para la detección; el contenido no es decodificable. */
const heicFalso = () => Buffer.concat([
  Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(12),
]);

module.exports = { jpg, png, jpgConExif, heicFalso };
