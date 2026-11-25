/**
 * sv/utils/fechas.js
 * Helpers seguros para manejar fechas que pueden venir como Date object
 * (Joi.date() convierte strings ISO a Date) o como string 'YYYY-MM-DD'.
 *
 * - aISO(d): 'YYYY-MM-DD' o null. Para fechas sin hora: de un Date toma el día en UTC
 * - rangoDia(d): { start: 'YYYY-MM-DD 00:00:00', end: 'YYYY-MM-DD 23:59:59' }
 * - diaBogotaISO(instante): día de Colombia de un instante válido, 'YYYY-MM-DD'
 * - hoyISO() / hoyBogotaISO(): 'YYYY-MM-DD' de hoy en Colombia
 */

const FORMATO_BOGOTA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });

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

/** Día de Colombia de un instante, 'YYYY-MM-DD'. Para fechas sin hora usa aISO(). */
function diaBogotaISO(instante) {
  return FORMATO_BOGOTA.format(new Date(instante));
}

/** Hoy en Colombia, 'YYYY-MM-DD'. */
function hoyBogotaISO() { return diaBogotaISO(new Date()); }

/** Igual que hoyBogotaISO(). Antes daba el día en UTC: después de las 7 p. m. era mañana. */
function hoyISO() { return hoyBogotaISO(); }

function rangoDia(d) {
  const iso = aISO(d) || hoyISO();
  return { start: `${iso} 00:00:00`, end: `${iso} 23:59:59`, fecha: iso };
}

function rango(desde, hasta) {
  const dStart = aISO(desde) || hoyISO();
  const dEnd   = aISO(hasta) || dStart;
  return { start: `${dStart} 00:00:00`, end: `${dEnd} 23:59:59`, desde: dStart, hasta: dEnd };
}

module.exports = { aISO, hoyISO, hoyBogotaISO, diaBogotaISO, rangoDia, rango };
