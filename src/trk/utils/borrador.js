// Puntaje vigente por criterio de una fila de la matriz (HU-8b): manda el borrador del jurado (incluido un
// null explícito = casilla vaciada); si no hay borrador para ese criterio se parte de la calificación final
// existente (p. ej. desbloqueada por el admin). La usan la matriz (TRK-CAL-004) y el envío final (TRK-CAL-006).
function borradorVigente(criterios, propios = new Map(), delFinal = new Map()) {
  return Object.fromEntries(criterios.map((c) => {
    if (propios.has(c.id)) return [c.id, propios.get(c.id)];
    return [c.id, delFinal.has(c.id) ? delFinal.get(c.id) : null];
  }));
}

module.exports = { borradorVigente };
