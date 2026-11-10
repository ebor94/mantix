/**
 * Festivos nacionales de Colombia, calculados (sin dependencias externas: ver docs/masajes/notas-masajes.md §5).
 *
 * Reglas, cada una con su ley y el año desde el que aplica:
 * - Fijos: no se trasladan aunque caigan en fin de semana.
 * - Trasladables (Ley 51 de 1983, "Ley Emiliani"): si no caen en lunes, el descanso pasa al lunes siguiente.
 * - Semana Santa (Jueves y Viernes Santo): fijos respecto a la Pascua.
 * - Ascensión, Corpus Christi y Sagrado Corazón: Pascua + 39/60/68 días, trasladados al lunes siguiente.
 * - Virgen de Chiquinquirá (Ley 2578 de 2026, 9 de julio, trasladable): desde 2026.
 *
 * Si una ley nueva agrega o cambia un festivo, se agrega aquí con su `desde` y un test con las fechas oficiales.
 * Mientras tanto, el admin puede bloquear cualquier día a mano (spec §5.2): un festivo que falte no queda abierto
 * si alguien lo bloquea.
 *
 * Las fechas se calculan en UTC puro (Date.UTC), sin zona horaria: son días de calendario, no instantes.
 */
const ANIO_MIN = 1984; // primer año completo con la Ley 51 de 1983
const ANIO_MAX = 2200;

const FIJOS = [
  { mes: 1, dia: 1, nombre: 'Año Nuevo' },
  { mes: 5, dia: 1, nombre: 'Día del Trabajo' },
  { mes: 7, dia: 20, nombre: 'Independencia' },
  { mes: 8, dia: 7, nombre: 'Batalla de Boyacá' },
  { mes: 12, dia: 8, nombre: 'Inmaculada Concepción' },
  { mes: 12, dia: 25, nombre: 'Navidad' },
];

const TRASLADABLES = [
  { mes: 1, dia: 6, nombre: 'Reyes Magos', desde: ANIO_MIN },
  { mes: 3, dia: 19, nombre: 'San José', desde: ANIO_MIN },
  { mes: 6, dia: 29, nombre: 'San Pedro y San Pablo', desde: ANIO_MIN },
  { mes: 7, dia: 9, nombre: 'Virgen de Chiquinquirá', desde: 2026 }, // Ley 2578 de 2026
  { mes: 8, dia: 15, nombre: 'Asunción de la Virgen', desde: ANIO_MIN },
  { mes: 10, dia: 12, nombre: 'Día de la Raza', desde: ANIO_MIN },
  { mes: 11, dia: 1, nombre: 'Todos los Santos', desde: ANIO_MIN },
  { mes: 11, dia: 11, nombre: 'Independencia de Cartagena', desde: ANIO_MIN },
];

// Días respecto al domingo de Pascua.
const DE_PASCUA_FIJOS = [{ dias: -3, nombre: 'Jueves Santo' }, { dias: -2, nombre: 'Viernes Santo' }];
const DE_PASCUA_TRASLADABLES = [
  { dias: 39, nombre: 'Ascensión del Señor' },
  { dias: 60, nombre: 'Corpus Christi' },
  { dias: 68, nombre: 'Sagrado Corazón' },
];

const DIA_MS = 86400000;
const utc = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia));
const iso = (d) => d.toISOString().slice(0, 10);
const masDias = (d, n) => new Date(d.getTime() + n * DIA_MS);
/** El mismo día si es lunes; si no, el lunes siguiente. */
const alLunes = (d) => masDias(d, (8 - d.getUTCDay()) % 7);

function validarAnio(anio) {
  if (!Number.isInteger(anio) || anio < ANIO_MIN || anio > ANIO_MAX) throw new Error('ANIO_NO_SOPORTADO');
}

/** Domingo de Pascua (algoritmo anónimo gregoriano, Meeus/Jones/Butcher). */
function pascuaDate(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(anio, mes, dia);
}

const pascua = (anio) => iso(pascuaDate(anio));

/** Festivos del año como YYYY-MM-DD, ordenados y sin duplicados. */
function festivosDelAnio(anio) {
  validarAnio(anio);
  const p = pascuaDate(anio);
  const fechas = [
    ...FIJOS.map((x) => utc(anio, x.mes, x.dia)),
    ...TRASLADABLES.filter((x) => anio >= x.desde).map((x) => alLunes(utc(anio, x.mes, x.dia))),
    ...DE_PASCUA_FIJOS.map((x) => masDias(p, x.dias)),
    ...DE_PASCUA_TRASLADABLES.map((x) => alLunes(masDias(p, x.dias))),
  ].map(iso);
  return [...new Set(fechas)].sort();
}

function validarFecha(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('FECHA_INVALIDA');
  const [a, m, d] = s.split('-').map(Number);
  if (iso(utc(a, m, d)) !== s) throw new Error('FECHA_INVALIDA'); // 2026-02-30, mes 13…
  return a;
}

/** Festivos entre `desde` y `hasta` (YYYY-MM-DD, ambos incluidos). */
function festivosEntre(desde, hasta) {
  const a1 = validarFecha(desde);
  const a2 = validarFecha(hasta);
  if (hasta < desde) return [];
  const out = [];
  for (let anio = a1; anio <= a2; anio++) {
    for (const f of festivosDelAnio(anio)) if (f >= desde && f <= hasta) out.push(f);
  }
  return out;
}

module.exports = { pascua, festivosDelAnio, festivosEntre, ANIO_MIN, ANIO_MAX };
