// Limpieza de texto libre que llega de usuarios o de archivos (nombres, cargos, motivos).
/** Quita caracteres de control y de ancho cero; saltos de linea y tabs pasan a espacio; colapsa espacios. */
function limpiar(s) {
  return String(s)
    .replace(/[\t\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { limpiar };
