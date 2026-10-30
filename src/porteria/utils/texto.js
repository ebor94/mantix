/** Patrón LIKE de "contiene" con los comodines del usuario escapados. */
function patronContiene(texto) {
  return `%${String(texto).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = { patronContiene };
