const { Op } = require('sequelize');
const { sequelize, Empresa, EmpresaPlan, Usuario, Rol } = require('../models');
const AppError = require('../utils/AppError');
const { plantillaReglas } = require('../rules/empresarialTemplates');
const { getParametrosVigentes } = require('./empresarialPricing.service');

const PLAN_TIPOS = ['UNIPERSONAL', 'BASICO', 'UNIFAMILIAR'];

async function verificarSlugDisponible(slug, empresaIdExcluir) {
  if (!slug) return;
  const where = { slug };
  if (empresaIdExcluir) where.id = { [Op.ne]: empresaIdExcluir };
  const existe = await Empresa.findOne({ where });
  if (existe) throw new AppError('El slug ya está en uso', 409);
}

async function listarEmpresas() {
  return Empresa.findAll({
    include: [{ model: EmpresaPlan, as: 'planes' }],
    order: [['nombre', 'ASC']]
  });
}

async function crearEmpresa(payload) {
  const parametros = await getParametrosVigentes(); // 409 si no hay año vigente
  const precios = parametros.preciosEstandar?.[payload.rangoAfiliados] || {};
  const existe = await Empresa.findOne({ where: { nit: payload.nit } });
  if (existe) throw new AppError('Ya existe una empresa con ese NIT', 409);
  await verificarSlugDisponible(payload.slug || null, null);

  const t = await sequelize.transaction();
  try {
    const empresa = await Empresa.create({
      nit: payload.nit,
      nombre: payload.nombre,
      rangoAfiliados: payload.rangoAfiliados,
      vigenciaInicio: payload.vigenciaInicio,
      vigenciaCierre: payload.vigenciaCierre,
      slug: payload.slug || null,
      asesorId: payload.asesorId != null ? payload.asesorId : null,
      publicoActivo: payload.publicoActivo != null ? payload.publicoActivo : 0,
      activo: 1
    }, { transaction: t });

    await EmpresaPlan.bulkCreate(
      PLAN_TIPOS.map(tipo => ({
        empresaId: empresa.id,
        planTipo: tipo,
        valorMensual: Number(precios[tipo]) || 0,
        reglas: plantillaReglas(tipo),
        activo: 1
      })),
      { transaction: t }
    );

    await t.commit();
    return Empresa.findByPk(empresa.id, { include: [{ model: EmpresaPlan, as: 'planes' }] });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function editarEmpresa(id, payload) {
  const empresa = await Empresa.findByPk(id);
  if (!empresa) throw new AppError('Empresa no encontrada', 404);
  if (payload.vigenciaInicio && payload.vigenciaCierre
    && new Date(payload.vigenciaCierre) <= new Date(payload.vigenciaInicio)) {
    throw new AppError('La vigencia de cierre debe ser posterior al inicio', 400);
  }
  if (payload.slug) await verificarSlugDisponible(payload.slug, id);
  await empresa.update(payload);
  return Empresa.findByPk(id, { include: [{ model: EmpresaPlan, as: 'planes' }] });
}

async function listarAsesores() {
  const usuarios = await Usuario.findAll({
    where: { activo: true },
    include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre', 'permisos'] }],
    attributes: ['id', 'nombre', 'apellido', 'email'],
    order: [['nombre', 'ASC'], ['apellido', 'ASC']]
  });

  const esAsesor = (usuario) => {
    const rol = usuario.rol;
    if (!rol) return false;
    if (rol.nombre === 'ASESOR_AFILIACIONES') return true;
    return !!(rol.permisos && rol.permisos.afiliaciones && rol.permisos.afiliaciones.crear);
  };

  return usuarios
    .filter(esAsesor)
    .map(u => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), email: u.email }));
}

module.exports = { listarEmpresas, crearEmpresa, editarEmpresa, listarAsesores, PLAN_TIPOS };
