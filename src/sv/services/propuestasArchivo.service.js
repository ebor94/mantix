/**
 * sv/services/propuestasArchivo.service.js
 * Propuestas adjuntas por empresa (renovación / vinculación).
 * Reemplaza la generación PDF: ahora se suben archivos.
 */
const fs = require('fs');
const path = require('path');
const { SvEmpresaPropuestaArchivo, SvEmpresa, SvUsuario } = require('../models');

const TIPOS_VALIDOS = ['vinculacion', 'renovacion', 'adendum', 'otro'];

async function listarPorEmpresa(empresaId) {
  return SvEmpresaPropuestaArchivo.findAll({
    where: { prop_empresa_id: empresaId },
    include: [
      { model: SvUsuario, as: 'subidoPor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['prop_subido_at', 'DESC']]
  });
}

async function crear(empresaId, payload, archivo, actorId) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa) { const e = new Error('Empresa no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (!archivo) { const e = new Error('Debe adjuntar un archivo'); e.code = 'VALIDATION_ERROR'; throw e; }
  if (payload.tipo && !TIPOS_VALIDOS.includes(payload.tipo)) {
    const e = new Error(`Tipo inválido (${TIPOS_VALIDOS.join('|')})`); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const relPath = archivo.path.split('uploads/')[1] || archivo.path;
  return SvEmpresaPropuestaArchivo.create({
    prop_empresa_id:     empresaId,
    prop_titulo:         payload.titulo,
    prop_descripcion:    payload.descripcion || null,
    prop_tipo:           payload.tipo || 'vinculacion',
    prop_archivo_url:    `uploads/${relPath}`,
    prop_archivo_size:   archivo.size,
    prop_archivo_mime:   archivo.mimetype,
    prop_valor:          payload.valor || null,
    prop_vigencia_desde: payload.vigencia_desde || null,
    prop_vigencia_hasta: payload.vigencia_hasta || null,
    prop_subido_por:     actorId
  });
}

async function eliminar(propId) {
  const p = await SvEmpresaPropuestaArchivo.findByPk(propId);
  if (!p) { const e = new Error('Propuesta no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  try {
    const full = path.resolve(process.cwd(), p.prop_archivo_url);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) { /* silencioso */ }
  await p.destroy();
  return { ok: true };
}

module.exports = { listarPorEmpresa, crear, eliminar, TIPOS_VALIDOS };
