const AppError = require('../utils/AppError');
const pricing = require('./empresarialPricing.service');
const { validarConjunto } = require('../rules/convenioRules');
const { buscarPrimaSeguro } = require('./tarifa.service');

function toYMD(d) {
  if (!d) return d;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

async function buscarEmpresaConPlanes(nit) {
  const { Empresa, EmpresaPlan } = require('../models');
  const empresa = await Empresa.findOne({
    where: { nit },
    include: [{ model: EmpresaPlan, as: 'planes', required: false, where: { activo: 1 } }]
  });
  if (!empresa) throw new AppError('Empresa no configurada para el canal empresarial', 404);
  if (!empresa.vigenciaInicio || !empresa.vigenciaCierre) {
    throw new AppError('La empresa no tiene vigencia configurada', 404);
  }
  if (!empresa.planes || empresa.planes.length === 0) {
    throw new AppError('La empresa no tiene planes activos configurados', 404);
  }
  return empresa;
}

async function buscarEmpresaPublicaPorSlug(slug) {
  const { Empresa, EmpresaPlan } = require('../models');
  const empresa = await Empresa.findOne({
    where: { slug, publicoActivo: 1 },
    include: [{ model: EmpresaPlan, as: 'planes', required: false, where: { activo: 1 } }]
  });
  if (!empresa) throw new AppError('Empresa no disponible', 404);
  if (!empresa.vigenciaInicio || !empresa.vigenciaCierre) throw new AppError('Empresa no disponible', 404);
  if (!empresa.planes || empresa.planes.length === 0) throw new AppError('Empresa no disponible', 404);
  return empresa;
}

function resolverPlan(empresa, planTipo) {
  const plan = (empresa.planes || []).find(p => p.planTipo === planTipo && p.activo);
  if (!plan) throw new AppError(`La empresa no tiene el plan ${planTipo} activo`, 400);
  return plan;
}

async function valorSegurosMensual(seguros = []) {
  let total = 0;
  for (const s of seguros) {
    const prima = await buscarPrimaSeguro(s.nombre, s.monto);
    total += Number(prima.prima) || 0;
  }
  return total;
}

function contarAdicionales(beneficiarios = []) {
  return beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL');
}

function construirContratoEmpresarial({ plan, parametros, beneficiariosAdicionales = [], asistencia = false, valorSegurosMensual = 0, empresa, fechaRegistro }) {
  const valorAdicionales = beneficiariosAdicionales.reduce(
    (s, b) => s + pricing.valorAdicionalPorEdad(b.edad, parametros), 0
  );
  const asist = asistencia ? (Number(parametros.valorAsistencia) || 0) : 0;
  const paqueteMensual = (Number(plan.valorMensual) || 0) + valorAdicionales + asist + (Number(valorSegurosMensual) || 0);
  const meses = pricing.mesesRestantes(toYMD(fechaRegistro), toYMD(empresa.vigenciaCierre));
  return {
    tarifaId: null,
    valorPlanExequial: +(Number(plan.valorMensual) || 0).toFixed(2),
    valorAdicionales: +valorAdicionales.toFixed(2),
    valorSeguros: +(Number(valorSegurosMensual) || 0).toFixed(2),
    periodicidad: 'MENSUAL',
    nCuotas: meses,
    valorCuota: +paqueteMensual.toFixed(2),
    valorTotal: +(paqueteMensual * meses).toFixed(2)
  };
}

async function cotizar({ nit, planTipo, fechaRegistro, beneficiarios = [], asistencia = false, seguros = [] }) {
  const empresa = await buscarEmpresaConPlanes(nit);
  const plan = resolverPlan(empresa, planTipo);
  const parametros = await pricing.getParametrosVigentes();
  const adicionales = contarAdicionales(beneficiarios);
  const segMensual = await valorSegurosMensual(seguros);
  const contrato = construirContratoEmpresarial({
    plan, parametros, beneficiariosAdicionales: adicionales, asistencia,
    valorSegurosMensual: segMensual, empresa, fechaRegistro
  });
  return {
    paqueteMensual: contrato.valorCuota,
    mesesRestantes: contrato.nCuotas,
    total: contrato.valorTotal,
    desglose: {
      plan: contrato.valorPlanExequial,
      adicionales: contrato.valorAdicionales,
      asistencia: asistencia ? (Number(parametros.valorAsistencia) || 0) : 0,
      seguros: contrato.valorSeguros
    }
  };
}

function titularDesdePayload(a) {
  return { estadoCivil: a?.estadoCivil || null, fechaNacimiento: a?.fechaNacimiento || null, edad: a?.edad };
}
function resumirErrores(errores) {
  if (!errores || !errores.length) return 'El grupo familiar no cumple las condiciones del plan.';
  if (errores.length === 1) return errores[0].mensaje;
  return `El grupo familiar no cumple las condiciones del plan:\n· ${errores.map(e => e.mensaje).join('\n· ')}`;
}
function assertReglasPlan(plan, afiliadoData, beneficiarios = []) {
  const res = validarConjunto(plan.reglas, { titular: titularDesdePayload(afiliadoData), beneficiarios }, {});
  if (!res.valido) throw new AppError(resumirErrores(res.errores), 400, { errores: res.errores });
}

module.exports = {
  buscarEmpresaConPlanes, buscarEmpresaPublicaPorSlug, resolverPlan, valorSegurosMensual, contarAdicionales,
  construirContratoEmpresarial, cotizar, assertReglasPlan
};
