const AppError = require('../utils/AppError');

/**
 * Meses completos (inclusivos) desde fechaRegistro hasta vigenciaCierre.
 * (cierreY-regY)*12 + (cierreM-regM) + 1, con mínimo 0.
 * Ej: 10-jun-2026 -> 31-ene-2027 = 8; 05-dic-2026 -> 31-ene-2027 = 2.
 */
function mesesRestantes(fechaRegistro, vigenciaCierre) {
  const [regY, regM] = fechaRegistro.split('-').map(Number);
  const [cierreY, cierreM] = vigenciaCierre.split('-').map(Number);
  const meses = (cierreY - regY) * 12 + (cierreM - regM) + 1;
  return Math.max(0, meses);
}

/** Valor mensual del adicional según edad: <50 -> menor50; 50..64 -> mayor50. */
function valorAdicionalPorEdad(edad, parametros) {
  return Number(edad) < 50
    ? Number(parametros.valorAdicionalMenor50)
    : Number(parametros.valorAdicionalMayor50);
}

/** Paquete mensual = plan + Σ adicionales por edad + asistencia + seguros (mensual). */
function calcularPaqueteMensual({ plan, beneficiariosAdicionales = [], asistencia = false, parametros, valorSegurosMensual = 0 }) {
  const base = Number(plan.valorMensual) || 0;
  const adic = beneficiariosAdicionales.reduce(
    (s, b) => s + valorAdicionalPorEdad(b.edad, parametros), 0
  );
  const asist = asistencia ? (Number(parametros.valorAsistencia) || 0) : 0;
  const seg = Number(valorSegurosMensual) || 0;
  return +(base + adic + asist + seg).toFixed(2);
}

/** Total a cobrar = paquete mensual × meses restantes hasta el cierre de la empresa. */
function calcularTotalEmpresarial({ plan, empresa, fechaRegistro, beneficiariosAdicionales = [], asistencia = false, parametros, valorSegurosMensual = 0 }) {
  const paqueteMensual = calcularPaqueteMensual({ plan, beneficiariosAdicionales, asistencia, parametros, valorSegurosMensual });
  const meses = mesesRestantes(fechaRegistro, empresa.vigenciaCierre);
  return { paqueteMensual, mesesRestantes: meses, total: +(paqueteMensual * meses).toFixed(2) };
}

/** Parámetros del canal vigentes (activo=1). */
async function getParametrosVigentes() {
  const { EmpresarialParametro } = require('../models');
  const p = await EmpresarialParametro.findOne({ where: { activo: 1 } });
  if (!p) throw new AppError('No hay parámetros del canal empresarial vigentes', 409);
  return p;
}

module.exports = {
  mesesRestantes,
  valorAdicionalPorEdad,
  calcularPaqueteMensual,
  calcularTotalEmpresarial,
  getParametrosVigentes
};
