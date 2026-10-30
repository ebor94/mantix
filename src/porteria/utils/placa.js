/** Placa comparable: mayúsculas, sin espacios ni guiones ("abc-123 " → "ABC123"). */
function normalizarPlaca(placa) {
  return String(placa ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** La misma normalización en SQL, para columnas que Portería no controla (p. ej. vehiculos.placa de H360). */
const placaSql = (columna) => `UPPER(REPLACE(REPLACE(${columna}, ' ', ''), '-', ''))`;

module.exports = { normalizarPlaca, placaSql };
