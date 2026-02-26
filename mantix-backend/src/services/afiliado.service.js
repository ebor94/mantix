const { sequelize, Afiliado, Beneficiario, Empresa, Seguro, ContratoValor, Tarifa } = require('../models');
const { buscarTarifa, calcularContrato } = require('./tarifa.service');
const { buscarPorNit, crearEmpresa } = require('./empresa.service');
const AppError = require('../utils/AppError');

async function createAfiliadoWithBeneficiarios(data) {
  const { beneficiarios = [], seguros = [], contrato = {}, ...afiliadoData } = data;

  const transaction = await sequelize.transaction();

  try {
    // ── 1. Resolver empresa por NIT ──────────────────────────
    if (afiliadoData.nit) {
      let empresa = await buscarPorNit(afiliadoData.nit);
      if (!empresa) {
        // Si no existe, la creamos con los datos que vienen del formulario
        empresa = await Empresa.create(
          { nit: afiliadoData.nit, nombre: afiliadoData.nombreEmpresa || afiliadoData.nit },
          { transaction }
        );
      }
      afiliadoData.empresaId = empresa.id;
      afiliadoData.nombreEmpresa = empresa.nombre;
    }

    // ── 2. Crear afiliado ────────────────────────────────────
    const afiliado = await Afiliado.create(afiliadoData, { transaction });

    // ── 3. Crear beneficiarios ───────────────────────────────
    if (beneficiarios.length > 0) {
      const beneficiariosConId = beneficiarios.map(b => ({ ...b, afiliadoId: afiliado.id }));
      await Beneficiario.bulkCreate(beneficiariosConId, { transaction });
    }

    // ── 4. Crear seguros y calcular primas ───────────────────
    if (seguros.length > 0) {
      const segurosConId = seguros.map(s => ({ ...s, afiliadoId: afiliado.id }));
      await Seguro.bulkCreate(segurosConId, { transaction });
    }

    // ── 5. Guardar contrato/valor ────────────────────────────
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.create(
        { ...contrato, afiliadoId: afiliado.id },
        { transaction }
      );
    }

    await transaction.commit();

    // Recargar con todas las relaciones incluidas
    const result = await Afiliado.findByPk(afiliado.id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' }
      ]
    });

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getAllAfiliados() {
  return Afiliado.findAll({
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function getAfiliadoById(id) {
  return Afiliado.findByPk(id, {
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' }
    ]
  });
}

async function getPendientes() {
  return Afiliado.findAll({
    where: { estadoRegistro: 0 },
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function aprobarAfiliado(id) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    estadoRegistro: 1,
    notificacionAprobacion: 1,
    fechaNotificacionAprobacion: new Date()
  });
  return afiliado;
}

module.exports = {
  createAfiliadoWithBeneficiarios,
  getAllAfiliados,
  getAfiliadoById,
  getPendientes,
  aprobarAfiliado
};
