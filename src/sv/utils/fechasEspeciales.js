/**
 * sv/utils/fechasEspeciales.js
 *
 * Helpers para calcular fechas especiales que dependen del año:
 *   - Día de la Madre Colombia: SEGUNDO domingo de mayo
 *   - Día del Padre Colombia:   TERCER  domingo de junio
 *
 * Estos valores se DERIVAN del género de la persona; no se almacenan en
 * sv_crm_fechas_especiales.
 *
 * También util: diasHasta(fechaISO) → entero (próxima ocurrencia anual).
 */

const { aISO, hoyISO } = require('./fechas');

/** Devuelve el N-ésimo domingo del mes (1-indexed). */
function ordinalDomingoDelMes(anio, mes /* 1-12 */, n) {
  // Encontrar el primer domingo del mes
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const diaSemana = primero.getUTCDay(); // 0 = domingo
  const diff = (7 - diaSemana) % 7;       // días hasta el primer domingo
  const primerDomingo = 1 + diff;
  const dia = primerDomingo + 7 * (n - 1);
  return aISO(new Date(Date.UTC(anio, mes - 1, dia)));
}

function diaMadre(anio) {
  return ordinalDomingoDelMes(anio, 5, 2);
}
function diaPadre(anio) {
  return ordinalDomingoDelMes(anio, 6, 3);
}

/**
 * Calcula la próxima ocurrencia anual de una fecha y la cantidad de días desde hoy.
 * Para 'YYYY-MM-DD' (típicamente nacimiento) devuelve la próxima vez que cae
 * (este año o el siguiente). Si la fecha cae HOY, dias_restantes = 0.
 *
 * @param {string} fechaISO  'YYYY-MM-DD'
 * @returns {{ proxima: string, anio: number, diasRestantes: number }}
 */
function proximaOcurrencia(fechaISO) {
  if (!fechaISO) return null;
  // Si viene como Date object (Sequelize DATEONLY), normalizar primero a 'YYYY-MM-DD'
  const iso = aISO(fechaISO);
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const mes = parseInt(m[2], 10);
  const dia = parseInt(m[3], 10);

  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const anioActual = hoyUTC.getUTCFullYear();

  let candidato = new Date(Date.UTC(anioActual, mes - 1, dia));
  let anioOcurrencia = anioActual;
  if (candidato < hoyUTC) {
    candidato = new Date(Date.UTC(anioActual + 1, mes - 1, dia));
    anioOcurrencia = anioActual + 1;
  }
  const ms = candidato.getTime() - hoyUTC.getTime();
  const diasRestantes = Math.round(ms / 86400000);
  return { proxima: aISO(candidato), anio: anioOcurrencia, diasRestantes };
}

/**
 * Genera fechas derivadas del género para un año dado.
 * @param {string|null} genero  'M'|'F'|'N'
 * @returns {Array<{ tipo: string, fecha: string, descripcion: string }>}
 */
function fechasDerivadas(genero, anio) {
  const out = [];
  if (genero === 'F') {
    out.push({ tipo: 'dia_madre', fecha: diaMadre(anio), descripcion: 'Día de la Madre' });
  } else if (genero === 'M') {
    out.push({ tipo: 'dia_padre', fecha: diaPadre(anio), descripcion: 'Día del Padre' });
  }
  return out;
}

const TIPOS_FECHA = ['nacimiento', 'aniversario_laboral', 'dia_madre', 'dia_padre', 'aniversario_boda', 'otro'];
const ESTADOS_ENVIO = ['enviado', 'confirmado', 'devuelto'];

module.exports = {
  ordinalDomingoDelMes,
  diaMadre,
  diaPadre,
  proximaOcurrencia,
  fechasDerivadas,
  TIPOS_FECHA,
  ESTADOS_ENVIO
};
