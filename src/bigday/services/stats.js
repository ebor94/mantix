// Estadísticas de la encuesta: funciones PURAS (sin BD ni Express) sobre filas tal como salen de la tabla.
// Códigos, orden y textos salen de survey.config.cjs (generado): nada está escrito a mano aquí.
const { QUESTIONS, labelFor } = require('../shared/survey.config.cjs');

const PREGUNTAS_OPCION = QUESTIONS.filter((q) => q.type === 'single');
const P6 = QUESTIONS.find((q) => q.id === 'p6');
const P2 = QUESTIONS.find((q) => q.id === 'p2');
const P3 = QUESTIONS.find((q) => q.id === 'p3');

// Escala NPS 1–10 (spec §7): promotores 9–10, pasivos 7–8, detractores 1–6.
const MIN_PROMOTOR = 9;
const MIN_PASIVO = 7;
const FRASES_POR_DEFECTO = 20;

const aMs = (fecha) => new Date(fecha).getTime();
const aIso = (fecha) => new Date(fecha).toISOString();

/** Número de respuestas. */
function totales(filas) {
  return filas.length;
}

/** P1–P5: conteo por código (incluye ceros) en el orden de QUESTIONS; P6: conteo por valor 1–10. */
function distribucion(filas) {
  const resultado = {};
  for (const q of PREGUNTAS_OPCION) {
    const conteo = new Map(q.options.map((o) => [o.code, 0]));
    for (const f of filas) {
      if (conteo.has(f[q.id])) conteo.set(f[q.id], conteo.get(f[q.id]) + 1);
    }
    resultado[q.id] = q.options.map((o) => ({
      codigo: o.code,
      label: labelFor(q.id, o.code),
      total: conteo.get(o.code),
    }));
  }
  const porValor = new Map();
  for (let v = P6.min; v <= P6.max; v += 1) porValor.set(v, 0);
  for (const f of filas) {
    const v = Number(f.p6);
    if (porValor.has(v)) porValor.set(v, porValor.get(v) + 1);
  }
  resultado.p6 = [...porValor].map(([valor, total]) => ({ valor, total }));
  return resultado;
}

/**
 * NPS = %promotores − %detractores. Redondeo: los porcentajes se devuelven con 1 decimal, pero el
 * NPS entero se calcula con enteros, Math.round(((P − D) × 100) / total), sin pasar por los porcentajes.
 * El total del NPS es promotores + pasivos + detractores: los p6 fuera de 1–10 se ignoran. Sin respuestas: porcentajes y nps en null (no se divide por cero).
 */
function nps(filas) {
  let total;
  let promotores = 0;
  let pasivos = 0;
  let detractores = 0;
  for (const f of filas) {
    const v = Number(f.p6);
    if (v >= MIN_PROMOTOR && v <= P6.max) promotores += 1;
    else if (v >= MIN_PASIVO && v < MIN_PROMOTOR) pasivos += 1;
    else if (v >= P6.min && v < MIN_PASIVO) detractores += 1;
    // Fuera de 1–10 (dato corrupto): no cuenta en ningún grupo ni en el total.
  }
  total = promotores + pasivos + detractores;
  if (total === 0) {
    return {
      total, promotores, pasivos, detractores,
      pctPromotores: null, pctPasivos: null, pctDetractores: null, nps: null,
    };
  }
  const pct = (n) => (n / total) * 100;
  const a1 = (x) => Math.round(x * 10) / 10;
  return {
    total, promotores, pasivos, detractores,
    pctPromotores: a1(pct(promotores)),
    pctPasivos: a1(pct(pasivos)),
    pctDetractores: a1(pct(detractores)),
    // Aritmética entera: (P − D) × 100 / total evita el error de coma flotante en los .5 exactos.
    nps: Math.round(((promotores - detractores) * 100) / total),
  };
}

/** Matriz P2 (filas) × P3 (columnas): todas las combinaciones, también las de 0, con etiquetas. */
function matrizP2P3(filas) {
  const conteo = new Map();
  for (const f of filas) {
    const clave = `${f.p2}\u0000${f.p3}`;
    conteo.set(clave, (conteo.get(clave) || 0) + 1);
  }
  const celdas = [];
  for (const o2 of P2.options) {
    for (const o3 of P3.options) {
      celdas.push({
        p2: o2.code,
        p2Label: labelFor('p2', o2.code),
        p3: o3.code,
        p3Label: labelFor('p3', o3.code),
        total: conteo.get(`${o2.code}\u0000${o3.code}`) || 0,
      });
    }
  }
  return celdas;
}

/** Últimas `limite` frases de P7, más recientes primero. Solo texto y fecha (ISO): nada identificable. */
function ultimasFrases(filas, limite = FRASES_POR_DEFECTO) {
  return filas
    .map((f, i) => ({ f, i }))
    // created_at desc; con la misma fecha, la fila que llegó después va primero.
    .sort((a, b) => aMs(b.f.created_at) - aMs(a.f.created_at) || b.i - a.i)
    .slice(0, limite)
    .map(({ f }) => ({ texto: f.p7, fecha: aIso(f.created_at) }));
}

module.exports = { totales, distribucion, nps, matrizP2P3, ultimasFrases, FRASES_POR_DEFECTO };
