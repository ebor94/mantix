// ============================================
// src/controllers/borrador.controller.js
// ============================================
const borradorService = require('../services/borrador.service');

/**
 * Cuando llega multipart, extrae los archivos subidos y los inyecta como
 * nombres en `body.afiliado.*` y `body.beneficiarios[i].documentoUrl`.
 * Si no llegó archivo nuevo en algún slot, deja lo que ya venía en el JSON
 * (probablemente el nombre persistido en BD).
 */
function extractFilesBorrador(req, body) {
  if (!req.files) return;
  body.afiliado = body.afiliado || {};
  if (req.files.soporte?.[0])             body.afiliado.soportePago         = req.files.soporte[0].filename;
  if (req.files.cedulaFrontal?.[0])       body.afiliado.cedulaFrontal       = req.files.cedulaFrontal[0].filename;
  if (req.files.cedulaReverso?.[0])       body.afiliado.cedulaReverso       = req.files.cedulaReverso[0].filename;
  if (req.files.contratoCompetencia?.[0]) body.afiliado.contratoCompetencia = req.files.contratoCompetencia[0].filename;

  if (Array.isArray(body.beneficiarios)) {
    body.beneficiarios = body.beneficiarios.map((b, i) => {
      const file = req.files[`beneficiario_doc_${i}`]?.[0];
      return file ? { ...b, documentoUrl: file.filename } : b;
    });
  }
}

async function crear(req, res, next) {
  try {
    const body = req.body;
    extractFilesBorrador(req, body);
    const borrador = await borradorService.crear(req.usuario.id, body);
    res.status(201).json({ success: true, data: borrador });
  } catch (err) {
    next(err);
  }
}

async function actualizar(req, res, next) {
  try {
    const body = req.body;
    extractFilesBorrador(req, body);
    const borrador = await borradorService.actualizar(
      parseInt(req.params.id),
      req.usuario.id,
      body
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
