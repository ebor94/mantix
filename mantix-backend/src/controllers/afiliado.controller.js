const afiliadoService = require('../services/afiliado.service');
const AppError = require('../utils/AppError');

async function create(req, res, next) {
  try {
    const body = { ...req.body };
    // Si viene un archivo adjunto (soporte de pago), guardar su nombre
    if (req.file) {
      body.soportePago = req.file.filename;
    }
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    res.status(201).json({
      success: true,
      message: 'Afiliado registrado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function getAll(req, res, next) {
  try {
    const afiliados = await afiliadoService.getAllAfiliados();
    res.json({
      success: true,
      data: afiliados
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id);
    if (!afiliado) {
      throw new AppError('Afiliado no encontrado', 404);
    }
    res.json({
      success: true,
      data: afiliado
    });
  } catch (error) {
    next(error);
  }
}

async function getPendientes(req, res, next) {
  try {
    const afiliados = await afiliadoService.getPendientes();
    res.json({
      success: true,
      data: afiliados
    });
  } catch (error) {
    next(error);
  }
}

async function aprobar(req, res, next) {
  try {
    const afiliado = await afiliadoService.aprobarAfiliado(req.params.id);
    res.json({
      success: true,
      message: 'Registro aprobado exitosamente',
      data: afiliado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, getAll, getById, getPendientes, aprobar };


