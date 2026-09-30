const { sequelize, EmpresaPlan, EmpresarialParametro } = require('../models');
const AppError = require('../utils/AppError');
const { parseReglas } = require('../rules/convenioRules');

async function editarPlan(empresaId, planTipo, payload) {
  const plan = await EmpresaPlan.findOne({ where: { empresaId, planTipo } });
  if (!plan) throw new AppError('Plan no encontrado para la empresa', 404);
  // Validar que las reglas son parseables por el motor antes de guardar.
  try { parseReglas(payload.reglas); }
  catch (e) { throw new AppError('Las reglas del plan no tienen un formato válido', 400); }
  await plan.update({
    valorMensual: payload.valorMensual,
    reglas: payload.reglas,
    activo: payload.activo != null ? payload.activo : plan.activo
  });
  return plan;
}

async function listarParametros() {
  return EmpresarialParametro.findAll({ order: [['anio', 'DESC']] });
}

async function crearParametro(payload) {
  const existe = await EmpresarialParametro.findOne({ where: { anio: payload.anio } });
  if (existe) throw new AppError('Ya existe un parámetro para ese año', 409);
  return EmpresarialParametro.create({ ...payload, activo: 0 });
}

async function editarParametro(anio, payload) {
  const p = await EmpresarialParametro.findOne({ where: { anio } });
  if (!p) throw new AppError('Parámetro no encontrado', 404);
  await p.update(payload);
  return p;
}

async function activarParametro(anio) {
  const p = await EmpresarialParametro.findOne({ where: { anio } });
  if (!p) throw new AppError('Parámetro no encontrado', 404);
  const t = await sequelize.transaction();
  try {
    await EmpresarialParametro.update({ activo: 0 }, { where: {}, transaction: t });
    await p.update({ activo: 1 }, { transaction: t });
    await t.commit();
    return p;
  } catch (err) { await t.rollback(); throw err; }
}

module.exports = { editarPlan, listarParametros, crearParametro, editarParametro, activarParametro };
