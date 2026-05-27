/**
 * sv/utils/nit.js
 * Normalización y validación de NIT colombiano.
 * - Acepta '900234567-1', '900.234.567-1', '900 234 567 - 1', '9002345671'
 * - Normaliza a solo dígitos del cuerpo (sin DV).
 * - Extrae DV (1 dígito) si está presente con guión final.
 */

function parse(raw) {
  if (raw == null) return { nit: null, dv: null, norm: null, original: null };
  const original = String(raw).trim();
  // Quita puntos, espacios, paréntesis
  const limpio = original.replace(/[\s.()]+/g, '');

  let cuerpo, dv = null;
  if (limpio.includes('-')) {
    const partes = limpio.split('-');
    cuerpo = partes[0].replace(/\D/g, '');
    dv = (partes[1] || '').replace(/\D/g, '').slice(0, 1) || null;
  } else {
    cuerpo = limpio.replace(/\D/g, '');
  }

  return { nit: original, norm: cuerpo, dv, original };
}

function normalizar(raw) { return parse(raw).norm; }

function esValido(raw) {
  const n = normalizar(raw);
  return !!n && n.length >= 7 && n.length <= 15;
}

function calcularDV(cuerpo) {
  // Algoritmo DIAN
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = String(cuerpo).split('').reverse();
  let suma = 0;
  for (let i = 0; i < digits.length; i++) {
    suma += parseInt(digits[i], 10) * (pesos[i] || 0);
  }
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

module.exports = { parse, normalizar, esValido, calcularDV };
