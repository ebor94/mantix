const { Op } = require('sequelize');
const { sequelize, Afiliado, Beneficiario, Empresa, Seguro, ContratoValor, Tarifa, Trazabilidad } = require('../models');
const { buscarTarifa, calcularContrato } = require('./tarifa.service');
const { buscarPorNit, crearEmpresa } = require('./empresa.service');
const reciboCajaService = require('./reciboCaja.service');
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
  'celular2', 'email', 'barrio', 'nit', 'nombreEmpresa', 'unidadNegocio', 'planVeolia',
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
    afiliadoData.estadoRegistro = 0; // Siempre inicia como pendiente, independiente del default BD
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

    // ── 6. Emitir recibo de caja si aplica ──────────────────
    //      Solo formas EFECTIVO / TRANSFERENCIA / CORRESPONSAL,
    //      origen ASESOR y asesor con prefijo_recibo configurado.
    //      POSFECHADO se cobra después con cobrarPosfechado().
    try {
      await reciboCajaService.crearReciboParaAfiliacion(afiliado, transaction);
    } catch (errRecibo) {
      // Si falla la generación del consecutivo, abortamos toda la
      // afiliación para mantener la integridad de la serie.
      throw errRecibo;
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
    // Mapear documentoUrl previo por numeroDocumento para preservarlo si la
    // corrección no trae uno nuevo (evita borrar archivos ya subidos).
    const prev = await Beneficiario.findAll({ where: { afiliadoId }, transaction });
    const prevDocByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoUrl]));

    await Beneficiario.destroy({ where: { afiliadoId }, transaction });
    if (beneficiarios.length > 0) {
      const conId = beneficiarios.map(b => {
        const { id, afiliadoId: _ignore, ...rest } = b;
        return {
          ...rest,
          afiliadoId,
          documentoUrl: rest.documentoUrl || prevDocByNumero.get(rest.numeroDocumento) || null
        };
      });
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

    // Reemplazar beneficiarios — preservando documentoUrl previo
    if (beneficiarios.length > 0) {
      const prev = await Beneficiario.findAll({ where: { afiliadoId: id }, transaction });
      const prevDocByNumero = new Map(prev.map(p => [p.numeroDocumento, p.documentoUrl]));

      await Beneficiario.destroy({ where: { afiliadoId: id }, transaction });
      const bConId = beneficiarios.map(b => {
        // Quitar id/afiliadoId del payload por seguridad (vienen del front)
        const { id: _idIgnored, afiliadoId: _afIgnored, ...rest } = b;
        return {
          ...rest,
          afiliadoId: id,
          documentoUrl: rest.documentoUrl || prevDocByNumero.get(rest.numeroDocumento) || null
        };
      });
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
 * Afiliaciones del asesor logueado en un rango de fechas, SIN filtrar
 * por estado de aprobación (devuelve pendientes, aprobadas y rechazadas).
 * Si el usuario es super_admin o tiene ver_todas, no filtra por asesorId.
 *
 * @param {Usuario} usuario
 * @param {object} params  { fecha, fechaDesde, fechaHasta }
 */
async function getMisDelDia(usuario, params = {}) {
  const where = {};
  // Filtro por asesor si no es super_admin / ver_todas
  if (!usuario.es_super_admin) {
    const p = getPermisos(usuario).afiliaciones || {};
    if (!p.ver_todas) where.asesorId = usuario.id;
  }

  // Filtro de fechas sobre createdAt
  if (params.fecha) {
    const ini = new Date(`${params.fecha}T00:00:00`);
    const fin = new Date(`${params.fecha}T23:59:59.999`);
    where.createdAt = { [Op.between]: [ini, fin] };
  } else if (params.fechaDesde || params.fechaHasta) {
    const rango = {};
    if (params.fechaDesde) rango[Op.gte] = new Date(`${params.fechaDesde}T00:00:00`);
    if (params.fechaHasta) rango[Op.lte] = new Date(`${params.fechaHasta}T23:59:59.999`);
    where.createdAt = rango;
  } else {
    // Default: día actual
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
    where.createdAt = { [Op.between]: [ini, fin] };
  }

  const { Usuario } = require('../models');
  return Afiliado.findAll({
    where,
    include: [
      { model: Beneficiario, as: 'beneficiarios' },
      { model: Seguro, as: 'seguros' },
      { model: ContratoValor, as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] },
      { model: Empresa, as: 'empresa' },
      { model: Usuario, as: 'legalizador', attributes: ['id', 'nombre', 'apellido'] }
    ],
    order: [['createdAt', 'DESC']]
  });
}

/**
 * Marca un lote de afiliaciones como legalizadas con un número de planilla.
 * Solo el asesor dueño de las afiliaciones puede legalizarlas (o super_admin).
 * Las que ya están legalizadas se ignoran silenciosamente.
 *
 * @param {number[]} afiliadoIds
 * @param {object}   usuario         - Req.usuario con id y es_super_admin
 * @param {string}   numeroPlanilla  - Número de planilla escrito por el asesor
 * @returns {{ legalizados: number, ignorados: number }}
 */
async function legalizarAfiliaciones(afiliadoIds, usuario, numeroPlanilla) {
  if (!numeroPlanilla || !String(numeroPlanilla).trim()) {
    throw new AppError('El número de planilla es obligatorio', 400);
  }
  if (!Array.isArray(afiliadoIds) || afiliadoIds.length === 0) {
    throw new AppError('Debe seleccionar al menos una afiliación', 400);
  }

  // Cargar las afiliaciones solicitadas
  const afiliaciones = await Afiliado.findAll({
    where: { id: { [Op.in]: afiliadoIds } },
    attributes: ['id', 'asesorId', 'legalizado', 'estadoRegistro', 'rechazado', 'rechazadoParcial']
  });

  if (afiliaciones.length === 0) {
    throw new AppError('No se encontraron afiliaciones con los IDs indicados', 404);
  }

  // Validar que todas pertenezcan al asesor (a menos que sea super_admin)
  if (!usuario.es_super_admin) {
    const ajena = afiliaciones.find(a => a.asesorId !== usuario.id);
    if (ajena) {
      throw new AppError('No tienes permisos para legalizar afiliaciones de otro asesor', 403);
    }
  }

  // Solo se pueden legalizar afiliaciones APROBADAS:
  //   estadoRegistro === 1 y sin rechazo (total o parcial)
  const noAprobadas = afiliaciones.filter(a =>
    a.estadoRegistro !== 1 || a.rechazado === 1 || a.rechazadoParcial === 1
  );
  if (noAprobadas.length > 0) {
    const ids = noAprobadas.map(a => a.id).join(', ');
    throw new AppError(
      `Solo se pueden legalizar afiliaciones aprobadas. Las siguientes no cumplen: ${ids}`,
      400
    );
  }

  // Separar las ya legalizadas de las pendientes
  const pendientes = afiliaciones.filter(a => !a.legalizado);
  const ignorados  = afiliaciones.length - pendientes.length;

  if (pendientes.length === 0) {
    return { legalizados: 0, ignorados };
  }

  const pendientesIds = pendientes.map(a => a.id);
  const ahora = new Date();

  const t = await sequelize.transaction();
  try {
    await Afiliado.update(
      {
        legalizado:            1,
        numeroPlanilla:        String(numeroPlanilla).trim(),
        fechaLegalizacion:     ahora,
        legalizacionAsesorId:  usuario.id
      },
      { where: { id: { [Op.in]: pendientesIds } }, transaction: t }
    );

    // Trazabilidad: una entrada por cada afiliación
    const entradas = pendientesIds.map(id => ({
      afiliadoId:  id,
      tipo:        'LEGALIZACION',
      descripcion: `Planilla N° ${String(numeroPlanilla).trim()} — legalizado por ${usuario.nombre || 'asesor'} (id ${usuario.id})`,
      usuarioId:   usuario.id
    }));
    await Trazabilidad.bulkCreate(entradas, { transaction: t });

    await t.commit();
    return { legalizados: pendientesIds.length, ignorados };
  } catch (err) {
    await t.rollback();
    throw err;
  }
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

/**
 * Carga afiliaciones por IDs y computa los agregados que necesita el PDF
 * de liquidación: productos por grupo, asistencia, seguros por nombre y
 * beneficiarios adicionales.
 *
 * Validaciones:
 *   - Todas las afiliaciones deben pertenecer al asesor (salvo super_admin
 *     o permiso 'afiliaciones.ver_todas').
 *   - Todas deben estar APROBADAS (estadoRegistro === 1, sin rechazo).
 *
 * @param {number[]} afiliadoIds
 * @param {object}   usuario
 * @returns {Promise<{ afiliaciones: object[], totales: object }>}
 */
async function calcularLiquidacion(afiliadoIds, usuario) {
  if (!Array.isArray(afiliadoIds) || afiliadoIds.length === 0) {
    throw new AppError('Debe seleccionar al menos una afiliación', 400);
  }

  const include = [
    { model: Beneficiario,   as: 'beneficiarios' },
    { model: Seguro,         as: 'seguros' },
    { model: ContratoValor,  as: 'contrato', include: [{ model: Tarifa, as: 'tarifa' }] }
  ];

  const afiliaciones = await Afiliado.findAll({
    where: { id: { [Op.in]: afiliadoIds } },
    include
  });

  if (afiliaciones.length === 0) {
    throw new AppError('No se encontraron afiliaciones con los IDs indicados', 404);
  }

  // Ownership: solo el asesor dueño (o super_admin / ver_todas)
  const permisos = getPermisos(usuario).afiliaciones || {};
  if (!usuario.es_super_admin && !permisos.ver_todas) {
    const ajena = afiliaciones.find(a => a.asesorId !== usuario.id);
    if (ajena) {
      throw new AppError(
        'No tienes permiso para generar liquidación de afiliaciones de otro asesor',
        403
      );
    }
  }

  // Solo aprobadas
  const noAprobadas = afiliaciones.filter(a =>
    a.estadoRegistro !== 1 || a.rechazado === 1 || a.rechazadoParcial === 1
  );
  if (noAprobadas.length > 0) {
    const ids = noAprobadas.map(a => a.id).join(', ');
    throw new AppError(
      `Solo se pueden incluir afiliaciones aprobadas. IDs no aprobados: ${ids}`,
      400
    );
  }

  // ── Agregados ──────────────────────────────────────────────────
  const totales = {
    productosPorGrupo: {}, // { BASICO: { cantidad, min, max, total } }
    asistencia:         { cantidad: 0, min: null, max: null, total: 0 },
    segurosPorNombre:   {}, // { SOLICANASTA: { cantidad, min, max, total } }
    adicionales:        { cantidad: 0, min: null, max: null, total: 0 },
    totalGeneral:       0,
    cantidadAfiliados:  afiliaciones.length
  };

  const upsertMinMax = (slot, valor) => {
    slot.min = slot.min == null ? valor : Math.min(slot.min, valor);
    slot.max = slot.max == null ? valor : Math.max(slot.max, valor);
  };

  for (const a of afiliaciones) {
    const contrato = a.contrato;
    const tarifa   = contrato?.tarifa;
    const valorPlan       = Number(contrato?.valorPlanExequial || 0);
    const valorAsistencia = Number(tarifa?.valorAsistencia || 0);
    const valorAdic       = Number(contrato?.valorAdicionales || 0);
    const valorTotalContr = Number(contrato?.valorTotal || 0);

    // Productos por grupo
    const grupo = a.grupo || '(sin grupo)';
    if (!totales.productosPorGrupo[grupo]) {
      totales.productosPorGrupo[grupo] = { cantidad: 0, min: null, max: null, total: 0 };
    }
    const slotGrupo = totales.productosPorGrupo[grupo];
    slotGrupo.cantidad += 1;
    slotGrupo.total    += valorPlan;
    upsertMinMax(slotGrupo, valorPlan);

    // Asistencia fuera de casa
    if (a.asistenciaFueraDeCasa === 'SI') {
      totales.asistencia.cantidad += 1;
      totales.asistencia.total    += valorAsistencia;
      upsertMinMax(totales.asistencia, valorAsistencia);
    }

    // Seguros agrupados por nombre
    const seguros = Array.isArray(a.seguros) ? a.seguros : [];
    for (const s of seguros) {
      const nombre = s.nombre || '(sin nombre)';
      const prima  = Number(s.prima || 0);
      if (!totales.segurosPorNombre[nombre]) {
        totales.segurosPorNombre[nombre] = { cantidad: 0, min: null, max: null, total: 0 };
      }
      const slotSeg = totales.segurosPorNombre[nombre];
      slotSeg.cantidad += 1;
      slotSeg.total    += prima;
      upsertMinMax(slotSeg, prima);
    }

    // Beneficiarios adicionales
    const beneficiarios = Array.isArray(a.beneficiarios) ? a.beneficiarios : [];
    const cantAdicAfil  = beneficiarios.filter(b => b.tipoBeneficiario === 'ADICIONAL').length;
    if (cantAdicAfil > 0) {
      totales.adicionales.cantidad += cantAdicAfil;
      totales.adicionales.total    += valorAdic;
      // El min/max se mide por afiliación, no por adicional individual
      upsertMinMax(totales.adicionales, valorAdic);
    }

    totales.totalGeneral += valorTotalContr;
  }

  return { afiliaciones, totales };
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
  getTrazabilidad,
  getMisDelDia,
  legalizarAfiliaciones,
  calcularLiquidacion
};
