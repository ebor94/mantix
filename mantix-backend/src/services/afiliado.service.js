const { sequelize, Afiliado, Beneficiario } = require('../models');

async function createAfiliadoWithBeneficiarios(data) {
  const { beneficiarios, ...afiliadoData } = data;

  const transaction = await sequelize.transaction();

  try {
    const afiliado = await Afiliado.create(afiliadoData, { transaction });

    if (beneficiarios && beneficiarios.length > 0) {
      const beneficiariosConId = beneficiarios.map(b => ({
        ...b,
        afiliadoId: afiliado.id
      }));

      await Beneficiario.bulkCreate(beneficiariosConId, { transaction });
    }

    await transaction.commit();

    // Recargar con beneficiarios incluidos
    const result = await Afiliado.findByPk(afiliado.id, {
      include: [{ model: Beneficiario, as: 'beneficiarios' }]
    });

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getAllAfiliados() {
  return Afiliado.findAll({
    include: [{ model: Beneficiario, as: 'beneficiarios' }],
    order: [['createdAt', 'DESC']]
  });
}

async function getAfiliadoById(id) {
  return Afiliado.findByPk(id, {
    include: [{ model: Beneficiario, as: 'beneficiarios' }]
  });
}

async function getPendientes() {
  return Afiliado.findAll({
    where: { estadoRegistro: 0 },
    include: [{ model: Beneficiario, as: 'beneficiarios' }],
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

module.exports = { createAfiliadoWithBeneficiarios, getAllAfiliados, getAfiliadoById, getPendientes, aprobarAfiliado };
