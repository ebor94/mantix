// ============================================
// src/controllers/observacionFrecuente.controller.js
// CRUD de observaciones frecuentes (chips del campo de observaciones).
// Lectura: cualquier usuario autenticado. Escritura: solo super_admin.
// ============================================
const { ObservacionFrecuente } = require('../models');
const AppError = require('../utils/AppError');

// GET /api/observaciones-frecuentes
// ?todas=1 → incluye inactivas (para la pantalla de administración).
async function listar(req, res, next) {
  try {
    const where = req.query.todas === '1' ? {} : { activo: true };
    const items = await ObservacionFrecuente.findAll({
      where,
      order: [['orden', 'ASC'], ['id', 'ASC']]
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function crear(req, res, next) {
  try {
    const { texto, activo, orden } = req.body || {};
    if (!texto || !String(texto).trim()) {
      return next(new AppError('El texto de la observación es obligatorio', 400));
    }
    const item = await ObservacionFrecuente.create({
      texto: String(texto).trim(),
      activo: activo === undefined ? true : !!activo,
      orden: Number.isInteger(orden) ? orden : 0
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const item = await ObservacionFrecuente.findByPk(req.params.id);
    if (!item) return next(new AppError('Observación no encontrada', 404));

    const { texto, activo, orden } = req.body || {};
    if (texto !== undefined) {
      if (!String(texto).trim()) return next(new AppError('El texto no puede estar vacío', 400));
      item.texto = String(texto).trim();
    }
    if (activo !== undefined) item.activo = !!activo;
    if (orden !== undefined && Number.isInteger(orden)) item.orden = orden;

    await item.save();
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    const item = await ObservacionFrecuente.findByPk(req.params.id);
    if (!item) return next(new AppError('Observación no encontrada', 404));
    await item.destroy();
    res.json({ success: true, message: 'Observación eliminada' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, crear, actualizar, eliminar };
