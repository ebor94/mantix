/**
 * sv/utils/contratante.js
 * Datos del contratante de un homenaje en sala, tal como vienen de Homenajes360.
 */
const { normalizar, esValido } = require('./telefono');

// Separadores entre varios números en un mismo campo. " - " va con espacios para no
// partir un número escrito como 300-123-4567.
const SEPARADORES = /\s*[\/,;|]\s*|\s+-\s+/;

function primerTelefonoValido(texto) {
  if (texto == null) return null;
  for (const parte of String(texto).split(SEPARADORES)) {
    const p = parte.trim();
    if (p && esValido(p)) return normalizar(p);
  }
  return null;
}

function formatearNombre(texto) {
  return String(texto || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_m, espacio, letra) => espacio + letra.toUpperCase())
    .slice(0, 100);
}

module.exports = { primerTelefonoValido, formatearNombre };
