// ============================================
// src/controllers/borrador.controller.js
// ============================================
const borradorService = require('../services/borrador.service');

async function crear(req, res, next) {
  try {
    const borrador = await borradorService.crear(req.usuario.id, req.body);
    res.status(201).json({ success: true, data: borrador });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const borrador = await borradorService.actualizar(
      parseInt(req.params.id),
      req.usuario.id,
      req.body
    );
    res.json({ success: true, data: borrador });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    const borradores = await borradorService.listar(req.usuario.id);
    res.json({ success: true, data: borradores });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const borrador = await borradorService.getOne(
      parseInt(req.params.id),
      req.usuario.id
    );
    res.json({ success: true, data: borrador });
  } catch (err) {
    next(err);
  }
}

async function eliminar(req, res, next) {
  try {
    await borradorService.eliminar(parseInt(req.params.id), req.usuario.id);
    res.json({ success: true, message: 'Borrador eliminado' });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, actualizar, listar, getOne, eliminar };
