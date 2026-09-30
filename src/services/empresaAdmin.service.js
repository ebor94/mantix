const { sequelize, Empresa, EmpresaPlan } = require('../models');
const AppError = require('../utils/AppError');
const { plantillaReglas } = require('../rules/empresarialTemplates');
const { getParametrosVigentes } = require('./empresarialPricing.service');

const PLAN_TIPOS = ['UNIPERSONAL', 'BASICO', 'UNIFAMILIAR'];

async function listarEmpresas() {
  return Empresa.findAll({
    include: [{ model: EmpresaPlan, as: 'planes' }],
    order: [['nombre', 'ASC']]
  });
}

async function crearEmpresa(payload) {
  const parametros = await getParametrosVigentes(); // 409 si no hay año vigente
  const precios = parametros.preciosEstandar?.[payload.rangoAfiliados] || {};
  const existe = await Empresa.findOne({ where: { nit: payload.nit } });
  if (existe) throw new AppError('Ya existe una empresa con ese NIT', 409);

  const t = await sequelize.transaction();
  try {
    const empresa = await Empresa.create({
      nit: payload.nit,
      nombre: payload.nombre,
      rangoAfiliados: payload.rangoAfiliados,
      vigenciaInicio: payload.vigenciaInicio,
      vigenciaCierre: payload.vigenciaCierre,
      activo: 1
    }, { transaction: t });

    await EmpresaPlan.bulkCreate(
      PLAN_TIPOS.map(tipo => ({
        empresaId: empresa.id,
        planTipo: tipo,
        valorMensual: Number(precios[tipo]) || 0,
        reglas: plantillaReglas(tipo),
        activo: 1
      })),
      { transaction: t }
    );

    await t.commit();
    return Empresa.findByPk(empresa.id, { include: [{ model: EmpresaPlan, as: 'planes' }] });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function editarEmpresa(id, payload) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new AppError('Empresa no encontrada', 404);
  if (payload.vigenciaInicio && payload.vigenciaCierre
    && new Date(payload.vigenciaCierre) <= new Date(payload.vigenciaInicio)) {
    throw new AppError('La vigencia de cierre debe ser posterior al inicio', 400);
  }
  await empresa.update(payload);
  return Empresa.findByPk(id, { include: [{ model: EmpresaPlan, as: 'planes' }] });
}

module.exports = { listarEmpresas, crearEmpresa, editarEmpresa, PLAN_TIPOS };
