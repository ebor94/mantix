/**
 * sv/services/tiposEmpresa.service.js
 * CRUD del catálogo parametrizable de tipos de empresa (UI: "Categorías").
 * Migración 017.
 */
const { SvTipoEmpresa } = require('../models');

async function list({ activo } = {}) {
  const where = {};
  if (activo === '1' || activo === 1) where.tipoemp_activo = 1;
  else if (activo === '0' || activo === 0) where.tipoemp_activo = 0;
  return SvTipoEmpresa.findAll({
    where,
    order: [['tipoemp_orden', 'ASC'], ['tipoemp_nombre', 'ASC']]
  });
}

async function crear(data) {
  const codigo = String(data.codigo || '').trim().toUpperCase();
  const nombre = String(data.nombre || '').trim();
  if (!codigo || !nombre) {
    const e = new Error('Código y nombre son requeridos'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const existente = await SvTipoEmpresa.findOne({ where: { tipoemp_codigo: codigo } });
  if (existente) {
    const e = new Error('Código ya existe'); e.code = 'DUPLICATE'; throw e;
  }
  return SvTipoEmpresa.create({
    tipoemp_codigo:      codigo,
    tipoemp_nombre:      nombre,
    tipoemp_descripcion: data.descripcion || null,
    tipoemp_orden:       parseInt(data.orden) || 0,
    tipoemp_activo:      data.activo === undefined ? 1 : (data.activo ? 1 : 0)
  });
}

async function actualizar(id, data) {
  const t = await SvTipoEmpresa.findByPk(id);
  if (!t) { const e = new Error('Tipo no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  const patch = {};
  if (data.nombre      !== undefined) patch.tipoemp_nombre      = String(data.nombre).trim();
  if (data.descripcion !== undefined) patch.tipoemp_descripcion = data.descripcion || null;
  if (data.orden       !== undefined) patch.tipoemp_orden       = parseInt(data.orden) || 0;
  if (data.activo      !== undefined) patch.tipoemp_activo      = data.activo ? 1 : 0;
  // El código es immutable una vez creado para no romper referencias en código frontend.
  await t.update(patch);
  return t;
}

module.exports = { list, crear, actualizar };
