// Fecha en hora de Colombia (UTC-5, sin horario de verano) como texto `YYYY-MM-DD HH:mm`.
// Se calcula con un desfase fijo sobre el instante: no depende de la zona horaria del servidor.
const DESFASE_MS = -5 * 60 * 60 * 1000;

const dos = (n) => String(n).padStart(2, '0');

function formatearFechaColombia(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  const l = new Date(fecha.getTime() + DESFASE_MS); // se lee con los getters UTC
  return `${l.getUTCFullYear()}-${dos(l.getUTCMonth() + 1)}-${dos(l.getUTCDate())} ${dos(l.getUTCHours())}:${dos(l.getUTCMinutes())}`;
}

module.exports = { formatearFechaColombia };
