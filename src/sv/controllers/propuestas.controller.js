/**
 * sv/controllers/propuestas.controller.js
 */
const path = require('path');
const propuestas = require('../services/propuestas.service');
const { ok, created, fail, noContent } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

async function list(req, res) {
  const r = await propuestas.list({ filtros: req.query, scope: req.scope });
  return ok(res, r);
}

async function getOne(req, res) {
  const p = await propuestas.obtener(parseInt(req.params.id));
  if (!p) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Propuesta no encontrada');
  return ok(res, p);
}

async function create(req, res) {
  const p = await propuestas.crear(req.body, req.user.usr_id);
  return created(res, p);
}

async function update(req, res) {
  try {
    const p = await propuestas.actualizar(parseInt(req.params.id), req.body);
    return ok(res, p);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

async function generarPdf(req, res) {
  try {
    const { archivo_url, fullPath } = await propuestas.generarPDF(parseInt(req.params.id));
    return ok(res, { archivo_url });
  } catch (e) {
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, e.message);
  }
}

async function previewPdf(req, res) {
  try {
    const { fullPath } = await propuestas.generarPDF(parseInt(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath)}"`);
    return require('fs').createReadStream(fullPath).pipe(res);
  } catch (e) {
    return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, e.message);
  }
}

async function enviar(req, res) {
  try {
    const r = await propuestas.enviar(parseInt(req.params.id), req.body, req.user.usr_id);
    return ok(res, r);
  } catch (e) {
    if (e.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    throw e;
  }
}

async function eliminar(req, res) {
  try {
    await propuestas.eliminar(parseInt(req.params.id));
    return noContent(res);
  } catch (e) {
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    throw e;
  }
}

module.exports = { list, getOne, create, update, generarPdf, previewPdf, enviar, eliminar };
