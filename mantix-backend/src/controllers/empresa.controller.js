const empresaService = require('../services/empresa.service');
const AppError = require('../utils/AppError');

async function buscarPorNit(req, res, next) {
  try {
    const { nit } = req.params;
    const empresa = await empresaService.buscarPorNit(nit);
    if (!empresa) {
      return res.status(404).json({ success: false, message: 'Empresa no encontrada' });
    }
    res.json({ success: true, data: empresa });
  } catch (error) {
    next(error);
  }
}

async function crear(req, res, next) {
  try {
    const empresa = await empresaService.crearEmpresa(req.body);
    res.status(201).json({ success: true, message: 'Empresa registrada', data: empresa });
  } catch (error) {
    next(error);
  }
}

async function listar(req, res, next) {
  try {
    const empresas = await empresaService.listarEmpresas({ q: req.query.q });
    res.json({ success: true, data: empresas });
  } catch (error) {
    next(error);
  }
}

module.exports = { buscarPorNit, crear, listar };
