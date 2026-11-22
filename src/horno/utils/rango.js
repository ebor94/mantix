// Rango de fechas de las consultas. Las fechas son DATETIME en hora de Colombia: se validan y se devuelven
// como texto 'YYYY-MM-DD HH:mm:ss' para pasarlas tal cual a MySQL (sin conversión de zona).
const HornoError = require('./HornoError');

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const dos = (n) => String(n).padStart(2, '0');

function leerFecha(texto, finDeDia) {
  if (typeof texto !== 'string') return null;
  const m = FORMATO.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const soloFecha = m[4] === undefined;
  const h = soloFecha ? (finDeDia ? 23 : 0) : Number(m[4]);
  const mi = soloFecha ? (finDeDia ? 59 : 0) : Number(m[5]);
  const s = soloFecha ? (finDeDia ? 59 : 0) : Number(m[6] ?? 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(anio, mes - 1, dia, h, mi, s);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null; // 30 de febrero
  return { texto: `${anio}-${dos(mes)}-${dos(dia)} ${dos(h)}:${dos(mi)}:${dos(s)}`, ms };
}

function leerRango(query = {}, { maxDias = 366 } = {}) {
  const desde = leerFecha(query.desde, false);
  const hasta = leerFecha(query.hasta, true);
  if (!desde || !hasta) {
    throw new HornoError(400, 'VALIDACION', 'Indica desde y hasta con formato AAAA-MM-DD o AAAA-MM-DD HH:mm:ss');
  }
  if (hasta.ms < desde.ms) throw new HornoError(400, 'VALIDACION', 'La fecha final debe ser posterior a la inicial');
  const dias = (hasta.ms - desde.ms) / 86400000;
  if (dias > maxDias) throw new HornoError(400, 'VALIDACION', `El rango no puede superar ${maxDias} días`);
  return { desde: desde.texto, hasta: hasta.texto, dias };
}

module.exports = { leerRango };
