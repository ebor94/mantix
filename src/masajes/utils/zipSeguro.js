/**
 * Inspección de un xlsx (zip) ANTES de abrirlo con exceljs (spec §17.7): un archivo de 2 MB bien armado
 * puede declarar gigabytes descomprimidos (zip bomb) y exceljs lo inflaría completo en memoria.
 *
 * Lee solo el directorio central (no descomprime nada) y rechaza:
 *  - lo que no es un zip bien formado → ARCHIVO_INVALIDO
 *  - más de MAX_ENTRADAS entradas, más de MAX_DESCOMPRIMIDO bytes declarados o ZIP64 → ARCHIVO_SOSPECHOSO
 *
 * Límite conocido: confía en los tamaños declarados. Un zip que mienta en ellos pasaría esta revisión; por eso
 * sigue habiendo defensa en profundidad: subida solo para admin, 2 MB máximo, rate limit y tope de filas.
 */
const { E } = require('./MasajesError');

const MAX_ENTRADAS = 200;
const MAX_DESCOMPRIMIDO = 50 * 1024 * 1024;
const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const MAX_COMENTARIO = 0xffff;

const invalido = () => E.VALIDACION([{ campo: 'archivo', motivo: 'ARCHIVO_INVALIDO' }]);
const sospechoso = () => E.VALIDACION([{ campo: 'archivo', motivo: 'ARCHIVO_SOSPECHOSO' }]);

function buscarFin(buf) {
  const desde = Math.max(0, buf.length - 22 - MAX_COMENTARIO);
  for (let p = buf.length - 22; p >= desde; p--) {
    if (buf.readUInt32LE(p) === FIRMA_FIN) return p;
  }
  return -1;
}

function inspeccionarZip(buf, { maxEntradas = MAX_ENTRADAS, maxDescomprimido = MAX_DESCOMPRIMIDO } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22 + 30 || buf.readUInt32LE(0) !== FIRMA_LOCAL) throw invalido();

  const fin = buscarFin(buf);
  if (fin < 0) throw invalido();
  const total = buf.readUInt16LE(fin + 10);
  const tamDir = buf.readUInt32LE(fin + 12);
  const inicioDir = buf.readUInt32LE(fin + 16);
  if (total === 0xffff || tamDir === 0xffffffff || inicioDir === 0xffffffff) throw sospechoso(); // ZIP64
  if (total > maxEntradas) throw sospechoso();
  if (inicioDir + tamDir > fin) throw invalido();

  let p = inicioDir;
  let descomprimido = 0;
  for (let i = 0; i < total; i++) {
    if (p + 46 > fin || buf.readUInt32LE(p) !== FIRMA_CENTRAL) throw invalido();
    const comprimido = buf.readUInt32LE(p + 20);
    const tam = buf.readUInt32LE(p + 24);
    if (comprimido === 0xffffffff || tam === 0xffffffff) throw sospechoso(); // ZIP64
    descomprimido += tam;
    if (descomprimido > maxDescomprimido) throw sospechoso();
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  if (p > fin) throw invalido();
  return { entradas: total, descomprimido };
}

module.exports = { inspeccionarZip, MAX_ENTRADAS, MAX_DESCOMPRIMIDO };
