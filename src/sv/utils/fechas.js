/**
 * sv/utils/fechas.js
 * Helpers seguros para manejar fechas que pueden venir como Date object
 * (Joi.date() convierte strings ISO a Date) o como string 'YYYY-MM-DD'.
 *
 * - aISO(d): siempre devuelve 'YYYY-MM-DD' (en zona local) o null
 * - rangoDia(d): { start: 'YYYY-MM-DD 00:00:00', end: 'YYYY-MM-DD 23:59:59' }
 * - hoyISO(): 'YYYY-MM-DD' de hoy
 */

function aISO(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    // Si ya viene como 'YYYY-MM-DD' o 'YYYY-MM-DDTxx:xx', cortar.
    return d.slice(0, 10);
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    // IMPORTANTE: usar UTC components. Joi.date() parsea 'YYYY-MM-DD' como UTC medianoche.
    // En zona horaria GMT-5 (Colombia), si usáramos getFullYear/Date locales obtendríamos el día anterior.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  return null;
}

function hoyISO() {
  return aISO(new Date());
}

function rangoDia(d) {
  const iso = aISO(d) || hoyISO();
  return { start: `${iso} 00:00:00`, end: `${iso} 23:59:59`, fecha: iso };
}

function rango(desde, hasta) {
  const dStart = aISO(desde) || hoyISO();
  const dEnd   = aISO(hasta) || dStart;
  return { start: `${dStart} 00:00:00`, end: `${dEnd} 23:59:59`, desde: dStart, hasta: dEnd };
}

module.exports = { aISO, hoyISO, rangoDia, rango };
