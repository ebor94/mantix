const { Empresa } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../utils/AppError');

async function buscarPorNit(nit) {
  return Empresa.findOne({ where: { nit } });
}

async function crearEmpresa(data) {
  const existe = await Empresa.findOne({ where: { nit: data.nit } });
  if (existe) throw new AppError('Ya existe una empresa con ese NIT', 409);
  return Empresa.create(data);
}

async function listarEmpresas({ q } = {}) {
  const where = { activo: 1 };
  if (q) {
    where[Op.or] = [
      { nit: { [Op.like]: `%${q}%` } },
      { nombre: { [Op.like]: `%${q}%` } }
    ];
  }
  return Empresa.findAll({ where, order: [['nombre', 'ASC']], limit: 50 });
}

module.exports = { buscarPorNit, crearEmpresa, listarEmpresas };
