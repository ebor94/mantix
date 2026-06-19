/**
 * sv/services/documentos.service.js
 * Documentos adjuntos por empresa (Cámara, RUT, Cédula RL, Otros).
 * Tipos configurables desde sv_cfg_tipos_documento.
 */
const fs = require('fs');
const path = require('path');
const { SvEmpresaDocumento, SvTipoDocumento, SvEmpresa, SvUsuario } = require('../models');

async function listarTipos({ soloActivos = true } = {}) {
  const where = soloActivos ? { tipo_activo: 1 } : {};
  return SvTipoDocumento.findAll({
    where,
    order: [['tipo_orden', 'ASC'], ['tipo_nombre', 'ASC']]
  });
}

async function crearTipo(payload) {
  return SvTipoDocumento.create({
    tipo_codigo:      payload.tipo_codigo,
    tipo_nombre:      payload.tipo_nombre,
    tipo_descripcion: payload.tipo_descripcion || null,
    tipo_obligatorio: payload.tipo_obligatorio ? 1 : 0,
    tipo_activo:      payload.tipo_activo === false ? 0 : 1,
    tipo_orden:       payload.tipo_orden ?? 0
  });
}

async function actualizarTipo(id, payload) {
  const t = await SvTipoDocumento.findByPk(id);
  if (!t) { const e = new Error('Tipo no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  const fields = {};
  ['tipo_nombre','tipo_descripcion','tipo_orden'].forEach(f => {
    if (payload[f] !== undefined) fields[f] = payload[f];
  });
  if (payload.tipo_obligatorio !== undefined) fields.tipo_obligatorio = payload.tipo_obligatorio ? 1 : 0;
  if (payload.tipo_activo !== undefined)     fields.tipo_activo = payload.tipo_activo ? 1 : 0;
  await t.update(fields);
  return t;
}

async function eliminarTipo(id) {
  const t = await SvTipoDocumento.findByPk(id);
  if (!t) return null;
  // Verificar que no tenga documentos asociados activos
  const usados = await SvEmpresaDocumento.count({ where: { doc_tipo_id: id } });
  if (usados > 0) {
    // No borrar físicamente: marcar como inactivo
    await t.update({ tipo_activo: 0 });
    return { soft: true };
  }
  await t.destroy();
  return { hard: true };
}

async function listarPorEmpresa(empresaId) {
  return SvEmpresaDocumento.findAll({
    where: { doc_empresa_id: empresaId },
    include: [
      { model: SvTipoDocumento, as: 'tipo' },
      { model: SvUsuario, as: 'subidoPor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['doc_subido_at', 'DESC']]
  });
}

async function crear(empresaId, payload, archivo, actorId) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa) { const e = new Error('Empresa no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (!archivo) { const e = new Error('Debe adjuntar un archivo'); e.code = 'VALIDATION_ERROR'; throw e; }
  const tipo = await SvTipoDocumento.findByPk(parseInt(payload.tipo_id));
  if (!tipo || !tipo.tipo_activo) { const e = new Error('Tipo de documento inválido o inactivo'); e.code = 'VALIDATION_ERROR'; throw e; }

  // multer guarda en disk con ruta absoluta; almacenamos relativa
  const relPath = archivo.path.split('uploads/')[1] || archivo.path;
  return SvEmpresaDocumento.create({
    doc_empresa_id:    empresaId,
    doc_tipo_id:       tipo.tipo_id,
    doc_nombre:        payload.nombre || tipo.tipo_nombre,
    doc_archivo_url:   `uploads/${relPath}`,
    doc_archivo_size:  archivo.size,
    doc_archivo_mime:  archivo.mimetype,
    doc_observaciones: payload.observaciones || null,
    doc_subido_por:    actorId
  });
}

async function eliminar(docId) {
  const d = await SvEmpresaDocumento.findByPk(docId);
  if (!d) { const e = new Error('Documento no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  // Borrar archivo físico si existe
  try {
    const full = path.resolve(process.cwd(), d.doc_archivo_url);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch (_) { /* silencioso */ }
  await d.destroy();
  return { ok: true };
}

module.exports = {
  listarTipos, crearTipo, actualizarTipo, eliminarTipo,
  listarPorEmpresa, crear, eliminar
};
