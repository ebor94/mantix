const { Op } = require('sequelize');
const AppError = require('../utils/AppError');

const MS_DIA = 86400000;
const RANGO_MAX_DIAS = 366;

/** Extrae el objeto de permisos del rol (puede venir como string JSON u objeto). */
function getPermisos(usuario) {
  const raw = usuario?.rol?.permisos;
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/** Decide el alcance de datos: global (todo) o scoped al asesorId del usuario. */
function resolverScope(usuario) {
  const esGlobal = !!usuario?.es_super_admin
    || getPermisos(usuario).afiliaciones?.ver_todas === true;
  return { esGlobal, asesorId: esGlobal ? null : (usuario?.id ?? null) };
}

/** Formatea un Date a 'YYYY-MM-DD' en hora local. */
function fmtYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Normaliza el rango: default mes actual, corrige orden, valida tope. */
function normalizarRango(desde, hasta, hoy = new Date()) {
  if (!desde || !hasta) {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: fmtYmd(primero), hasta: fmtYmd(ultimo) };
  }
  let d = String(desde).slice(0, 10);
  let h = String(hasta).slice(0, 10);
  if (d > h) { const t = d; d = h; h = t; }
  const dias = (new Date(`${h}T00:00:00`) - new Date(`${d}T00:00:00`)) / MS_DIA;
  if (dias > RANGO_MAX_DIAS) {
    throw new AppError('El rango de fechas no puede superar un año.', 400);
  }
  return { desde: d, hasta: h };
}

/** Granularidad de la serie: día si el rango es corto, si no mes. */
function elegirGranularidad(desde, hasta) {
  const dias = (new Date(`${hasta}T00:00:00`) - new Date(`${desde}T00:00:00`)) / MS_DIA;
  return dias <= 31 ? 'dia' : 'mes';
}

/** Construye el WHERE de Sequelize aplicando rango, scope y filtro de origen. */
function construirWhere({ rango, scope, origen, convenioId }) {
  const where = {
    createdAt: {
      [Op.between]: [
        new Date(`${rango.desde}T00:00:00`),
        new Date(`${rango.hasta}T23:59:59.999`)
      ]
    }
  };
  if (!scope.esGlobal) {
    where.asesorId = scope.asesorId;
    return where;
  }
  if (origen && ['ASESOR', 'VEOLIA', 'CONVENIO'].includes(origen)) {
    where.origen = origen;
    if (origen === 'CONVENIO' && convenioId) where.convenioId = Number(convenioId);
  }
  return where;
}

module.exports = {
  getPermisos, resolverScope, normalizarRango, elegirGranularidad, construirWhere
};
