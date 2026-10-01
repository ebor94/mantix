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

/**
 * Siembra (idempotente) los planTipos que le falten a la empresa, usando los
 * precios estándar del rango vigente y las plantillas de reglas. No toca los
 * planes que ya existen. Devuelve cuántos creó.
 *
 * Importante: las empresas que ya existían en la tabla `empresas` (por
 * convenios, Veolia o afiliaciones previas) no pasaron por `crearEmpresa`, así
 * que nunca tuvieron planes; `editarEmpresa` los genera aquí al guardar.
 */
async function sembrarPlanesFaltantes(empresaId, rango, parametros, transaction) {
  const precios = parametros.preciosEstandar?.[rango] || {};
  const existentes = await EmpresaPlan.findAll({
    where: { empresaId }, attributes: ['planTipo'], transaction
  });
  const yaHay = new Set(existentes.map(p => p.planTipo));
  const faltantes = PLAN_TIPOS.filter(t => !yaHay.has(t));
  if (faltantes.length === 0) return 0;
  await EmpresaPlan.bulkCreate(
    faltantes.map(tipo => ({
      empresaId,
      planTipo: tipo,
      valorMensual: Number(precios[tipo]) || 0,
      reglas: plantillaReglas(tipo),
      activo: 1
    })),
    { transaction }
  );
  return faltantes.length;
}

async function crearEmpresa(payload) {
  const parametros = await getParametrosVigentes(); // 409 si no hay año vigente
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

    await sembrarPlanesFaltantes(empresa.id, payload.rangoAfiliados, parametros, t);

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

  const t = await sequelize.transaction();
  try {
    await empresa.update(payload, { transaction: t });
    // Generar los planes faltantes para empresas que ya existían y ahora tienen
    // rango (nunca pasaron por crearEmpresa). Idempotente: no duplica los que haya.
    if (empresa.rangoAfiliados) {
      const parametros = await getParametrosVigentes(); // 409 si no hay año vigente
      await sembrarPlanesFaltantes(empresa.id, empresa.rangoAfiliados, parametros, t);
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
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
