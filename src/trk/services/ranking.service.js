// ============================================
// Ranking por categoría (R3–R6). Función PURA: sin BD, sin Express.
// El orden de desempate sale de criterios[].peso_desempate (dato de la rúbrica).
// ============================================
const redondear2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function compararManual(a, b) {
  if (a.desempate_manual == null && b.desempate_manual == null) return 0;
  if (a.desempate_manual == null) return 1;
  if (b.desempate_manual == null) return -1;
  return a.desempate_manual - b.desempate_manual;
}

function calcularRanking({ participantes, criterios, calificaciones, juradosActivos, puestosPremiados }) {
  const activos = new Set(juradosActivos);
  const criteriosDesempate = criterios
    .filter((c) => c.peso_desempate != null)
    .sort((a, b) => a.peso_desempate - b.peso_desempate);

  const base = participantes.map((p) => {
    const propias = calificaciones.filter((c) => c.participante_id === p.id && activos.has(c.jurado_id));
    const n = propias.length;
    const promedio = (fn) => (n ? redondear2(propias.reduce((s, c) => s + fn(c), 0) / n) : null);
    return {
      participante_id: p.id,
      mascota_nombre: p.mascota_nombre,
      puesto: null,
      puntaje_final: promedio((c) => c.total),
      promedios: Object.fromEntries(criterios.map((cr) => [cr.codigo, promedio((c) => c.puntajes[cr.id] ?? 0)])),
      n_calificaciones: n,
      n_jurados: activos.size,
      completa: activos.size > 0 && [...activos].every((j) => propias.some((c) => c.jurado_id === j)),
      premiado: false,
      empate_sin_resolver: false,
      desempate_manual: p.desempate_manual ?? null
    };
  });

  const clave = (f) => [f.puntaje_final, ...criteriosDesempate.map((c) => f.promedios[c.codigo])];
  const compararAutomatico = (a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };

  const completas = base
    .filter((f) => f.completa)
    .sort((a, b) => compararAutomatico(a, b) || compararManual(a, b) || a.mascota_nombre.localeCompare(b.mascota_nombre));

  const empates = [];
  let puesto = 1;
  for (let i = 0; i < completas.length;) {
    let j = i;
    while (j + 1 < completas.length && compararAutomatico(completas[i], completas[j + 1]) === 0) j += 1;
    const grupo = completas.slice(i, j + 1);
    const manuales = grupo.map((f) => f.desempate_manual);
    const resuelto = grupo.length === 1 || (manuales.every((m) => m != null) && new Set(manuales).size === manuales.length);
    if (resuelto) {
      grupo.forEach((f, k) => { f.puesto = puesto + k; });
    } else {
      grupo.forEach((f) => { f.puesto = puesto; });
      if (puesto <= puestosPremiados) {
        grupo.forEach((f) => { f.empate_sin_resolver = true; });
        empates.push(grupo.map((f) => f.participante_id));
      }
    }
    puesto += grupo.length;
    i = j + 1;
  }
  completas.forEach((f) => { f.premiado = f.puesto <= puestosPremiados; });

  const incompletas = base
    .filter((f) => !f.completa)
    .sort((a, b) => (b.puntaje_final ?? -1) - (a.puntaje_final ?? -1) || a.mascota_nombre.localeCompare(b.mascota_nombre));

  return { filas: [...completas, ...incompletas], empates_sin_resolver: empates };
}

module.exports = { calcularRanking, redondear2 };
