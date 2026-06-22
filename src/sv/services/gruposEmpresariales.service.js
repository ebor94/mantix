/**
 * sv/services/gruposEmpresariales.service.js
 * CRUD + findOrCreate de grupos económicos (Grupo Éxito, Grupo Bolívar, etc.).
 * Migración 017.
 */
const { Op } = require('sequelize');
const { SvGrupoEmpresarial } = require('../models');

function normalizar(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ');
}

async function list({ q, activo = 1, limit = 50 } = {}) {
  const where = {};
  if (activo !== undefined && activo !== null) where.grupemp_activo = parseInt(activo);
  if (q) {
    const term = `%${normalizar(q)}%`;
    where.grupemp_nombre = { [Op.like]: term };
  }
  return SvGrupoEmpresarial.findAll({
    where,
    order: [['grupemp_nombre', 'ASC']],
    limit: Math.min(parseInt(limit) || 50, 200)
  });
}

async function getOne(id) {
  return SvGrupoEmpresarial.findByPk(id);
}

/**
 * Crea el grupo si no existe (match exacto case-insensitive por nombre).
 * Devuelve { grupo, creado: boolean }.
 */
async function findOrCreate({ nombre, descripcion = null, creadoPor = null }) {
  const nom = normalizar(nombre);
  if (!nom || nom.length < 2) {
    const e = new Error('Nombre del grupo empresarial es requerido (mín. 2 caracteres)');
    e.code = 'VALIDATION_ERROR'; throw e;
  }
  const existente = await SvGrupoEmpresarial.findOne({
    where: sequelizeWhereCI(nom)
  });
  if (existente) {
    if (!existente.grupemp_activo) {
      await existente.update({ grupemp_activo: 1 });
    }
    return { grupo: existente, creado: false };
  }
  const grupo = await SvGrupoEmpresarial.create({
    grupemp_nombre:      nom,
    grupemp_descripcion: descripcion || null,
    grupemp_activo:      1,
    grupemp_creado_por:  creadoPor
  });
  return { grupo, creado: true };
}

function sequelizeWhereCI(nom) {
  // MySQL collation utf8mb4_unicode_ci hace LIKE case-insensitive por defecto
  return { grupemp_nombre: nom };
}

async function actualizar(id, data) {
  const g = await SvGrupoEmpresarial.findByPk(id);
  if (!g) { const e = new Error('Grupo empresarial no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  const patch = {};
  if (data.nombre      !== undefined) patch.grupemp_nombre      = normalizar(data.nombre);
  if (data.descripcion !== undefined) patch.grupemp_descripcion = data.descripcion || null;
  if (data.activo      !== undefined) patch.grupemp_activo      = data.activo ? 1 : 0;
  await g.update(patch);
  return g;
}

module.exports = { list, getOne, findOrCreate, actualizar };
