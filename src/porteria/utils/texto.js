const PorteriaError = require('./PorteriaError');

/** Patrón LIKE de "contiene" con los comodines del usuario escapados. */
function patronContiene(texto) {
  return `%${String(texto).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Texto opcional de la query: recortado, vacío → undefined, máximo `max` caracteres. */
function textoOpcional(valor, max = 50) {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  const texto = valor.trim();
  if (texto.length > max) throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  return texto === '' ? undefined : texto;
}

module.exports = { patronContiene, textoOpcional };
