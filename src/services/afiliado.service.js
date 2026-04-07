const { Op } = require('sequelize');
const { sequelize, Afiliado, Beneficiario, Empresa, Seguro, ContratoValor, Tarifa } = require('../models');
const { buscarTarifa, calcularContrato } = require('./tarifa.service');
const { buscarPorNit, crearEmpresa } = require('./empresa.service');
const AppError = require('../utils/AppError');

/**
 * Extrae el objeto de permisos del rol del usuario
 * (el campo permisos puede venir como string JSON o como objeto JS)
 */
function getPermisos(usuario) {
  const raw = usuario?.rol?.permisos;
  if (!raw) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Construye la cláusula WHERE para getPendientes / getRechazados
 * según los permisos del usuario:
 *   - super_admin o ver_todas → sin filtro por asesorId
 *   - ver_propias             → filtrar por asesorId del usuario
 */
function whereConFiltroAsesor(baseWhere, usuario) {
  if (usuario.es_super_admin) return baseWhere;
  const p = getPermisos(usuario).afiliaciones || {};
  if (p.ver_todas) return baseWhere;
  // Solo ve las propias
  return { ...baseWhere, asesorId: usuario.id };
}

// Convierte strings vacíos a null para evitar truncamiento en columnas ENUM/DATE
const NULLABLE_FIELDS = [
  'sucursal', 'novedad', 'vigenciaDesde', 'vigenciaHasta',
  'canal', 'producto', 'grupo', 'asistenciaFueraDeCasa',
  'celular2', 'email', 'barrio', 'nit', 'nombreEmpresa',
  'actividadEconomica', 'ocupacion', 'codigoCiiu',
  'usuarioCens', 'cicloEstrato', 'relacionPredio', 'observaciones',
  'referenciaPago1', 'referenciaPago2', 'referenciaPago3', 'formaPago'
]
function nullifyEmpty(obj) {
  const result = { ...obj }
  for (const field of NULLABLE_FIELDS) {
    if (result[field] === '') result[field] = null
  }
  return result
}

async function createAfiliadoWithBeneficiarios(data) {
  const { beneficiarios = [], seguros = [], contrato = {}, ...raw } = data;
  const afiliadoData = nullifyEmpty(raw);

  const transaction = await sequelize.transaction();

  try {
    // ── 1. Resolver empresa por NIT ──────────────────────────
    if (afiliadoData.nit) {
      let empresa = await buscarPorNit(afiliadoData.nit);
      if (!empresa) {
        // Si no existe, la creamos con los datos que vienen del formulario
        empresa = await Empresa.create(
          { nit: afiliadoData.nit, nombre: afiliadoData.nombreEmpresa || afiliadoData.nit },
          { transaction }
        );
      }
      afiliadoData.empresaId = empresa.id;
      afiliadoData.nombreEmpresa = empresa.nombre;
    }

    // ── 2. Crear afiliado ────────────────────────────────────
    if (afiliadoData.notificacionRecibo === undefined) afiliadoData.notificacionRecibo = 1;
    afiliadoData.fechaNotificacionRecibo = new Date();
    const afiliado = await Afiliado.create(afiliadoData, { transaction });

    // ── 3. Crear beneficiarios ───────────────────────────────
    if (beneficiarios.length > 0) {
      const beneficiariosConId = beneficiarios.map(b => ({ ...b, afiliadoId: afiliado.id }));
      await Beneficiario.bulkCreate(beneficiariosConId, { transaction });
    }

    // ── 4. Crear seguros y calcular primas ───────────────────
    if (seguros.length > 0) {
      const segurosConId = seguros.map(s => ({ ...s, afiliadoId: afiliado.id }));
      await Seguro.bulkCreate(segurosConId, { transaction });
    }

    // ── 5. Guardar contrato/valor ────────────────────────────
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.create(
        { ...contrato, afiliadoId: afiliado.id },
        { transaction }
      );
    }

    await transaction.commit();

    // Recargar con todas las relaciones incluidas
    const result = await Afiliado.findByPk(afiliado.id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' }
      ]
    });

    return result;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getAllAfiliados() {
  return Afiliado.findAll({
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function getAfiliadoById(id) {
  return Afiliado.findByPk(id, {
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' }
    ]
  });
}

/**
 * Afiliaciones pendientes (estadoRegistro=0, no rechazadas)
 * Si el usuario es asesor (ver_propias), solo retorna las propias.
 * Si es aprobador o admin, retorna todas.
 */
async function getPendientes(usuario) {
  const baseWhere = { estadoRegistro: 0, rechazado: { [Op.not]: 1 } };
  const where = whereConFiltroAsesor(baseWhere, usuario);

  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function aprobarAfiliado(id) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    estadoRegistro: 1,
    rechazado: 0,
    motivoRechazo: null
    //notificacionAprobacion: 1,
    //fechaNotificacionAprobacion: new Date()
  });
  return afiliado;
}

async function rechazarAfiliado(id, motivo) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    rechazado: 1,
    motivoRechazo: motivo || null,
    estadoRegistro: 0
  });
  return afiliado;
}

/**
 * Afiliaciones rechazadas
 * Si el usuario es asesor (ver_propias), solo retorna las propias.
 * Si es aprobador o admin, retorna todas.
 */
async function getRechazados(usuario) {
  const baseWhere = { rechazado: 1 };
  const where = whereConFiltroAsesor(baseWhere, usuario);

  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['updatedAt', 'DESC']]
  });
}

/**
 * Reenviar una afiliación rechazada para nueva revisión.
 * Solo el asesor que la creó o un super_admin puede reenviarla.
 */
async function reenviarAfiliacion(id, data, usuario) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  if (!afiliado.rechazado) throw new AppError('La afiliación no está en estado rechazado', 400);

  // Validar ownership: solo el asesor dueño o super_admin pueden reenviar
  if (!usuario.es_super_admin && afiliado.asesorId !== usuario.id) {
    throw new AppError('No tienes permiso para reenviar esta afiliación', 403);
  }

  const { beneficiarios = [], seguros = [], contrato = {}, ...afiliadoData } = data;
  const transaction = await sequelize.transaction();

  try {
    // Resetear rechazo y actualizar datos
    afiliadoData.rechazado = 0;
    afiliadoData.motivoRechazo = null;
    afiliadoData.estadoRegistro = 0;

    await afiliado.update(afiliadoData, { transaction });

    // Reemplazar beneficiarios
    if (beneficiarios.length > 0) {
      await Beneficiario.destroy({ where: { afiliadoId: id }, transaction });
      const bConId = beneficiarios.map(b => ({ ...b, afiliadoId: id }));
      await Beneficiario.bulkCreate(bConId, { transaction });
    }

    // Reemplazar seguros
    if (seguros.length > 0) {
      await Seguro.destroy({ where: { afiliadoId: id }, transaction });
      const sConId = seguros.map(s => ({ ...s, afiliadoId: id }));
      await Seguro.bulkCreate(sConId, { transaction });
    }

    // Reemplazar contrato
    if (contrato && Object.keys(contrato).length > 0) {
      await ContratoValor.destroy({ where: { afiliadoId: id }, transaction });
      await ContratoValor.create({ ...contrato, afiliadoId: id }, { transaction });
    }

    await transaction.commit();

    return Afiliado.findByPk(id, {
      include: [
        { model: Beneficiario, as: 'beneficiarios' },
        { model: Seguro, as: 'seguros' },
        { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
        { model: Empresa, as: 'empresa' }
      ]
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  createAfiliadoWithBeneficiarios,
  getAllAfiliados,
  getAfiliadoById,
  getPendientes,
  aprobarAfiliado,
  rechazarAfiliado,
  getRechazados,
  reenviarAfiliacion
};
