const { Op } = require('sequelize');
const { sequelize, Afiliado, Beneficiario, Empresa, Seguro, ContratoValor, Tarifa, Trazabilidad } = require('../models');
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
  'referenciaPago1', 'referenciaPago2', 'referenciaPago3', 'formaPago',
  'fechaPagoTentativa', 'contratoCompetencia'
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
  const baseWhere = { estadoRegistro: 0, rechazado: { [Op.not]: 1 }, rechazadoParcial: 0 };
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

async function aprobarAfiliado(id, usuarioId) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    estadoRegistro: 1,
    rechazado: 0,
    motivoRechazo: null
    //notificacionAprobacion: 1,
    //fechaNotificacionAprobacion: new Date()
  });
  // Trazabilidad
  Trazabilidad.create({ afiliadoId: id, tipo: 'APROBACION', usuarioId: usuarioId || null }).catch(() => {});
  return afiliado;
}

async function rechazarAfiliado(id, motivo, usuarioId) {
  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update({
    rechazado: 1,
    motivoRechazo: motivo || null,
    estadoRegistro: 0
  });
  // Trazabilidad
  Trazabilidad.create({
    afiliadoId: id,
    tipo: 'RECHAZO_TOTAL',
    descripcion: motivo || null,
    usuarioId: usuarioId || null
  }).catch(() => {});
  return afiliado;
}

/**
 * Rechazo parcial: inactiva beneficiarios específicos.
 * El afiliado permanece en estado pendiente.
 */
async function rechazarBeneficiarios(afiliadoId, ids, motivo, usuarioId) {
  const { encodeId } = require('../utils/hashId');
  const afiliado = await Afiliado.findByPk(afiliadoId);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

  const hash = encodeId(afiliadoId);

  // Obtener nombres de los beneficiarios antes de inactivarlos
  const beneficiariosAInactivar = await Beneficiario.findAll({
    where: { id: ids, afiliadoId },
    attributes: ['primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido']
  });
  const nombresBenef = beneficiariosAInactivar
    .map(b => [b.primerNombre, b.segundoNombre, b.primerApellido, b.segundoApellido]
      .filter(Boolean).join(' '))
    .join('; ');

  const transaction = await sequelize.transaction();
  try {
    await Beneficiario.update(
      { activo: 0, motivoRechazo: motivo || null },
      { where: { id: ids, afiliadoId }, transaction }
    );
    // Marcar afiliado como rechazado parcialmente y guardar hash de corrección
    await afiliado.update({ rechazadoParcial: 1, hashCorreccion: hash }, { transaction });
    await Trazabilidad.create({
      afiliadoId,
      tipo: 'RECHAZO_PARCIAL',
      descripcion: `Beneficiarios inactivados: ${nombresBenef || ids.join(', ')}. Motivo: ${motivo || ''}`,
      usuarioId: usuarioId || null
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return Afiliado.findByPk(afiliadoId, {
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato' },
      { model: Empresa, as: 'empresa' }
    ]
  });
}

/**
 * Busca el afiliado más reciente por número de documento (consulta pública).
 */
async function getAfiliadoByDocumento(numeroDocumento) {
  return Afiliado.findOne({
    where: { numeroDocumento },
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Registra una consulta en la tabla de trazabilidad.
 */
async function registrarConsulta(afiliadoId, usuarioId, descripcion) {
  return Trazabilidad.create({
    afiliadoId,
    tipo: 'CONSULTA',
    descripcion: descripcion || null,
    usuarioId: usuarioId || null
  });
}

/**
 * Actualiza (reemplaza) los beneficiarios de un afiliado desde la vista de consulta pública.
 */
async function actualizarBeneficiariosConsulta(afiliadoId, beneficiarios, usuarioId) {
  const afiliado = await Afiliado.findByPk(afiliadoId);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

  const transaction = await sequelize.transaction();
  try {
    await Beneficiario.destroy({ where: { afiliadoId }, transaction });
    if (beneficiarios.length > 0) {
      const conId = beneficiarios.map(b => ({ ...b, afiliadoId }));
      await Beneficiario.bulkCreate(conId, { transaction });
    }
    await Trazabilidad.create({
      afiliadoId,
      tipo: 'ACTUALIZACION_BENEFICIARIOS',
      descripcion: `${beneficiarios.length} beneficiario(s) actualizado(s)`,
      usuarioId: usuarioId || null
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return Afiliado.findByPk(afiliadoId, {
    include: [{ model: Beneficiario, as: 'beneficiarios' }]
  });
}

/**
 * Afiliaciones rechazadas
 * Si el usuario es asesor (ver_propias), solo retorna las propias.
 * Si es aprobador o admin, retorna todas.
 */
async function getRechazados(usuario) {
  const baseWhere = {
    [Op.or]: [
      { rechazado: 1 },
      { rechazadoParcial: 1 }
    ]
  };
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
  if (!afiliado.rechazado && !afiliado.rechazadoParcial)
    throw new AppError('La afiliación no está en estado rechazado', 400);

  // Validar ownership: solo el asesor dueño o super_admin pueden reenviar.
  // Si no hay usuario autenticado (ruta pública via hash+OTP), se omite el chequeo
  // porque el hash cifrado + OTP ya actúan como control de acceso.
  if (usuario && !usuario.es_super_admin && afiliado.asesorId !== usuario.id) {
    throw new AppError('No tienes permiso para reenviar esta afiliación', 403);
  }

  const { beneficiarios = [], seguros = [], contrato = {}, otp: _otp, ...afiliadoData } = data;
  const transaction = await sequelize.transaction();

  try {
    // Resetear rechazo (total y parcial) y actualizar datos
    afiliadoData.rechazado = 0;
    afiliadoData.rechazadoParcial = 0;
    afiliadoData.hashCorreccion = null;
    afiliadoData.motivoRechazo = null;
    afiliadoData.estadoRegistro = 0;

    // Convertir cadenas vacías a null en campos ENUM/nullable (ej: sucursal, novedad)
    const cleanData = nullifyEmpty(afiliadoData);
    await afiliado.update(cleanData, { transaction });

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

/**
 * Actualiza solo los campos de contacto editables por el afiliado.
 * Registra trazabilidad ACTUALIZACION_DATOS.
 */
async function actualizarDatosContacto(id, datos, usuarioId) {
  const camposPermitidos = ['celular', 'celular2', 'email', 'direccion', 'barrio', 'ciudad', 'departamento'];
  const update = {};
  camposPermitidos.forEach(k => {
    if (datos[k] !== undefined) update[k] = datos[k] || null;
  });

  const afiliado = await Afiliado.findByPk(id);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
  await afiliado.update(update);

  Trazabilidad.create({
    afiliadoId: id,
    tipo: 'ACTUALIZACION_DATOS',
    descripcion: `Campos actualizados: ${Object.keys(update).join(', ')}`,
    usuarioId: usuarioId || null
  }).catch(() => {});

  return afiliado;
}

/**
 * Retorna el historial de trazabilidad de un afiliado, ordenado de más reciente a más antiguo.
 */
async function getTrazabilidad(afiliadoId) {
  const { Usuario } = require('../models');
  return Trazabilidad.findAll({
    where: { afiliadoId },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'email'] }],
    order: [['createdAt', 'DESC']]
  });
}

module.exports = {
  createAfiliadoWithBeneficiarios,
  getAllAfiliados,
  getAfiliadoById,
  getPendientes,
  aprobarAfiliado,
  rechazarAfiliado,
  rechazarBeneficiarios,
  getRechazados,
  reenviarAfiliacion,
  getAfiliadoByDocumento,
  registrarConsulta,
  actualizarBeneficiariosConsulta,
  actualizarDatosContacto,
  getTrazabilidad
};
