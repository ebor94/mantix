const { EmpresaNomina } = require('../models');
const AppError = require('../utils/AppError');

async function buscarEnNomina(empresaId, cedula) {
  const doc = String(cedula || '').replace(/\D/g, '');
  if (!doc) throw new AppError('Documento inválido', 400);
  const fila = await EmpresaNomina.findOne({
    where: { empresaId, numeroDocumento: doc, activo: 1 }
  });
  if (!fila) throw new AppError('Empleado no está en la nómina de esta empresa', 404);
  return fila;
}

module.exports = { buscarEnNomina };
