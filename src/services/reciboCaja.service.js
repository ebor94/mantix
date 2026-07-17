// ============================================
// src/services/reciboCaja.service.js
// Servicio de recibos de caja:
//   - Generación de consecutivos por prefijo (atómica con FOR UPDATE)
//   - Creación de recibos al crear afiliación (excepto POSFECHADO)
//   - Cobro posterior de POSFECHADO (genera consecutivo al cobrar)
//   - Listados para asesor (sus recibos) y cajero (cuadre)
//   - Aprobación por el cajero con trazabilidad
// ============================================
const { Op } = require('sequelize');
const {
  sequelize,
  ReciboCaja,
  ConsecutivoRecibo,
  Afiliado,
  Usuario,
  Trazabilidad
} = require('../models');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const FORMAS_PAGO_QUE_GENERAN_RECIBO = ['EFECTIVO', 'TRANSFERENCIA', 'CORRESPONSAL', 'PAGO_EN_CAJA'];
const FORMA_PAGO_AL_COBRAR_POSFECHADO = 'POSFECHADO_COBRADO';

// Mapping de forma de pago → tipo de aprobación
//   EFECTIVO              → aprueba CAJERO    (permiso caja.aprobar_efectivo)
//   TRANSFERENCIA         → aprueba CARTERA   (permiso caja.aprobar_bancarios)
//   CORRESPONSAL          → aprueba CARTERA   (permiso caja.aprobar_bancarios)
//   POSFECHADO_COBRADO    → aprueba CARTERA   (típicamente entra como consignación/transferencia)
const FORMAS_EFECTIVO  = ['EFECTIVO', 'PAGO_EN_CAJA'];
const FORMAS_BANCARIAS = ['TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO_COBRADO'];

/**
 * Lee los permisos del módulo caja desde el usuario.
 * Retorna un resumen booleano para que el llamador decida qué hacer.
 */
function permisosCaja(usuario) {
  if (!usuario) return { efectivo: false, bancarios: false, all: false, superAdmin: false };
  if (usuario.es_super_admin) {
    return { efectivo: true, bancarios: true, all: true, superAdmin: true };
  }
  const raw = usuario.rol?.permisos;
  const p = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  const c = p.caja || {};
  const efectivo  = !!c.aprobar_efectivo;
  const bancarios = !!c.aprobar_bancarios;
  return { efectivo, bancarios, all: efectivo && bancarios, superAdmin: false };
}

/**
 * Formatea consecutivo numérico como string con padding a 6 dígitos.
 *   1 -> "000001"; 42 -> "000042"
 */
function formatearConsecutivo(n) {
  return String(n).padStart(6, '0');
}

/**
 * Genera el siguiente consecutivo para el prefijo dado, dentro de la
 * transacción provista. Bloquea la fila correspondiente con FOR UPDATE
 * para evitar race conditions entre peticiones concurrentes del mismo
 * asesor.
 *
 * @param {string} prefijo
 * @param {object} transaction Sequelize transaction
 * @returns {{ consecutivo:number, numeroRecibo:string }}
 */
async function generarConsecutivo(prefijo, transaction) {
  if (!prefijo) throw new AppError('Prefijo requerido para generar consecutivo', 500);

  // FOR UPDATE para serializar emisiones concurrentes del mismo prefijo
  let fila = await ConsecutivoRecibo.findOne({
    where: { prefijo },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!fila) {
    // Primera vez que se solicita un consecutivo para este prefijo:
    // tomamos como base el MÁXIMO consecutivo realmente emitido en
    // recibos_caja (cubre el caso de recibos insertados manualmente
    // antes de que existiera la fila del contador, o de borrados de
    // la tabla consecutivos_recibo sin truncar recibos_caja).
    const maxExistente = await ReciboCaja.max('consecutivo', {
      where: { prefijo },
      transaction
    });
    const base = Number(maxExistente) || 0;
    const siguiente = base + 1;
    fila = await ConsecutivoRecibo.create(
      { prefijo, ultimoNumero: siguiente },
      { transaction }
    );
    return { consecutivo: siguiente, numeroRecibo: `${prefijo}-${formatearConsecutivo(siguiente)}` };
  }

  const siguiente = fila.ultimoNumero + 1;
  await fila.update({ ultimoNumero: siguiente }, { transaction });
  return { consecutivo: siguiente, numeroRecibo: `${prefijo}-${formatearConsecutivo(siguiente)}` };
}

/**
 * Construye el payload del recibo desde un afiliado ya creado.
 */
function buildReciboPayload({ afiliado, asesor, prefijo, consecutivo, numeroRecibo, formaPagoFinal, valorOverride }) {
  return {
    afiliadoId: afiliado.id,
    asesorId: asesor.id,
    prefijo,
    consecutivo,
    numeroRecibo,
    formaPago: formaPagoFinal,
    valor: valorOverride ?? afiliado.valorRecibido ?? 0,
    banco: afiliado.referenciaPago1 || null,
    referencia: afiliado.referenciaPago2 || null,
    soporteUrl: afiliado.soportePago || null,
    estadoCuadre: 'PENDIENTE',
    fechaEmision: new Date()
  };
}

/**
 * Crea un recibo asociado a una afiliación recién creada, solo si la
 * forma de pago no es POSFECHADO. Debe llamarse DENTRO de la transacción
 * que crea la afiliación para garantizar atomicidad del consecutivo.
 *
 * Si la forma de pago es POSFECHADO o el asesor no tiene prefijo_recibo
 * configurado, no crea recibo y retorna null (no falla).
 *
 * @param {Afiliado} afiliado instancia ya creada
 * @param {Sequelize.Transaction} transaction
 * @returns {ReciboCaja|null}
 */
async function crearReciboParaAfiliacion(afiliado, transaction) {
  if (!afiliado.asesorId) return null; // origen VEOLIA público, sin asesor → sin recibo
  if (!afiliado.formaPago) return null;
  if (!FORMAS_PAGO_QUE_GENERAN_RECIBO.includes(afiliado.formaPago)) return null;

  const asesor = await Usuario.findByPk(afiliado.asesorId, { transaction });
  if (!asesor) {
    logger.warn(`[ReciboCaja] Asesor ${afiliado.asesorId} no existe — no se genera recibo`);
    return null;
  }
  if (!asesor.prefijo_recibo) {
    logger.warn(`[ReciboCaja] Asesor ${asesor.id} (${asesor.nombre} ${asesor.apellido}) sin prefijo_recibo — no se genera recibo`);
    return null;
  }

  const { consecutivo, numeroRecibo } = await generarConsecutivo(asesor.prefijo_recibo, transaction);

  const recibo = await ReciboCaja.create(
    buildReciboPayload({
      afiliado,
      asesor,
      prefijo: asesor.prefijo_recibo,
      consecutivo,
      numeroRecibo,
      formaPagoFinal: afiliado.formaPago
    }),
    { transaction }
  );

  logger.info(`[ReciboCaja] Emitido ${numeroRecibo} para afiliado ${afiliado.id}`);
  return recibo;
}

/**
 * Marca un pago POSFECHADO como cobrado: crea el recibo, asigna
 * consecutivo y opcionalmente actualiza referencia/banco si el asesor
 * los provee al cobrar.
 *
 * @param {number} afiliadoId
 * @param {Usuario} usuario el asesor (o super_admin) que marca el cobro
 * @param {object} datos { banco, referencia, observacion, formaPagoFinal? }
 * @returns {ReciboCaja}
 */
async function cobrarPosfechado(afiliadoId, usuario, datos = {}) {
  const afiliado = await Afiliado.findByPk(afiliadoId);
  if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

  // Validar pertenencia (asesor solo puede cobrar sus afiliaciones; super_admin pasa)
  if (!usuario.es_super_admin && afiliado.asesorId !== usuario.id) {
    throw new AppError('No tienes permiso para cobrar esta afiliación', 403);
  }

  if (afiliado.formaPago !== 'POSFECHADO') {
    throw new AppError('Esta afiliación no tiene un pago posfechado pendiente', 400);
  }

  const existente = await ReciboCaja.findOne({ where: { afiliadoId } });
  if (existente) {
    throw new AppError(`Ya existe un recibo emitido para esta afiliación (${existente.numeroRecibo})`, 400);
  }

  // El usuario que cobra debe tener prefijo (asesor) o ser super_admin con prefijo
  // configurado. Para super_admin sin prefijo, usamos el prefijo del asesor original.
  const asesorOriginal = await Usuario.findByPk(afiliado.asesorId);
  if (!asesorOriginal || !asesorOriginal.prefijo_recibo) {
    throw new AppError('El asesor de esta afiliación no tiene prefijo de recibo configurado', 400);
  }
  const prefijo = asesorOriginal.prefijo_recibo;

  const transaction = await sequelize.transaction();
  try {
    const { consecutivo, numeroRecibo } = await generarConsecutivo(prefijo, transaction);

    const payload = buildReciboPayload({
      afiliado,
      asesor: asesorOriginal,
      prefijo,
      consecutivo,
      numeroRecibo,
      formaPagoFinal: FORMA_PAGO_AL_COBRAR_POSFECHADO
    });

    // Overrides desde los datos del cobro
    if (datos.banco) payload.banco = datos.banco;
    if (datos.referencia) payload.referencia = datos.referencia;
    if (datos.soporteUrl) payload.soporteUrl = datos.soporteUrl;

    const recibo = await ReciboCaja.create(payload, { transaction });

    await Trazabilidad.create({
      afiliadoId,
      tipo: 'COBRO_POSFECHADO',
      descripcion: `Recibo ${numeroRecibo} emitido al cobrar pago posfechado` +
        (datos.observacion ? ` — ${datos.observacion}` : ''),
      usuarioId: usuario.id
    }, { transaction });

    await transaction.commit();
    logger.info(`[ReciboCaja] Posfechado cobrado: ${numeroRecibo} para afiliado ${afiliadoId} por usuario ${usuario.id}`);
    return recibo;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Construye filtros por rango de fechas desde query params.
 * Acepta { fecha } (un solo día) o { fechaDesde, fechaHasta }.
 */
function buildWhereFechaEmision({ fecha, fechaDesde, fechaHasta }) {
  if (fecha) {
    const inicio = new Date(`${fecha}T00:00:00`);
    const fin    = new Date(`${fecha}T23:59:59.999`);
    return { fechaEmision: { [Op.between]: [inicio, fin] } };
  }
  if (fechaDesde || fechaHasta) {
    const rango = {};
    if (fechaDesde) rango[Op.gte] = new Date(`${fechaDesde}T00:00:00`);
    if (fechaHasta) rango[Op.lte] = new Date(`${fechaHasta}T23:59:59.999`);
    return { fechaEmision: rango };
  }
  // Default: día actual
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
  const fin    = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
  return { fechaEmision: { [Op.between]: [inicio, fin] } };
}

const INCLUDE_RECIBO_COMPLETO = [
  {
    model: Afiliado,
    as: 'afiliado',
    attributes: ['id', 'numeroDocumento', 'primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido', 'celular', 'estadoRegistro', 'rechazado', 'rechazadoParcial']
  },
  { model: Usuario, as: 'asesor',     attributes: ['id', 'nombre', 'apellido', 'prefijo_recibo'] },
  { model: Usuario, as: 'aprobador',  attributes: ['id', 'nombre', 'apellido'] }
];

/**
 * Lista los recibos de un asesor (los propios).
 */
async function listarRecibosAsesor(asesorId, params = {}) {
  const where = { asesorId, ...buildWhereFechaEmision(params) };
  return ReciboCaja.findAll({
    where,
    include: INCLUDE_RECIBO_COMPLETO,
    order: [['fechaEmision', 'DESC'], ['id', 'DESC']]
  });
}

/**
 * Lista recibos para el cuadre de caja, aplicando el filtro de forma
 * de pago según los permisos del usuario:
 *   - Cajero (solo aprobar_efectivo)    → solo EFECTIVO
 *   - Cartera (solo aprobar_bancarios)  → solo TRANSFERENCIA, CORRESPONSAL, POSFECHADO_COBRADO
 *   - Admin / super_admin               → todas las formas
 *
 * El query param `?tipo=efectivo|bancarios|todos` permite forzar un
 * subconjunto siempre que el usuario tenga ese permiso.
 *
 * @param {Usuario} usuario
 * @param {object} params { fecha, fechaDesde, fechaHasta, asesorId, estado, tipo }
 */
async function listarRecibosParaCuadre(usuario, { fecha, fechaDesde, fechaHasta, asesorId, estado, tipo } = {}) {
  const where = { ...buildWhereFechaEmision({ fecha, fechaDesde, fechaHasta }) };
  if (asesorId) where.asesorId = asesorId;
  if (estado)   where.estadoCuadre = estado;

  const p = permisosCaja(usuario);

  // Determinar el conjunto de formas a mostrar
  let formasVisibles = [];
  if (p.superAdmin || p.all) {
    formasVisibles = [...FORMAS_EFECTIVO, ...FORMAS_BANCARIAS];
  } else if (p.efectivo) {
    formasVisibles = [...FORMAS_EFECTIVO];
  } else if (p.bancarios) {
    formasVisibles = [...FORMAS_BANCARIAS];
  } else {
    // Sin permisos: lista vacía
    return [];
  }

  // Override por query param (intersectado con lo permitido)
  if (tipo === 'efectivo') {
    formasVisibles = formasVisibles.filter(f => FORMAS_EFECTIVO.includes(f));
  } else if (tipo === 'bancarios') {
    formasVisibles = formasVisibles.filter(f => FORMAS_BANCARIAS.includes(f));
  } // 'todos' o ausente: no se restringe más

  if (formasVisibles.length === 0) return [];
  where.formaPago = { [Op.in]: formasVisibles };

  return ReciboCaja.findAll({
    where,
    include: INCLUDE_RECIBO_COMPLETO,
    order: [['fechaEmision', 'ASC'], ['id', 'ASC']]
  });
}

/**
 * Aprueba uno o varios recibos (estado PENDIENTE → APROBADO) con observación opcional.
 *
 * Valida permisos por forma de pago:
 *   - EFECTIVO              → requiere caja.aprobar_efectivo
 *   - TRANSFERENCIA / CORRESPONSAL / POSFECHADO_COBRADO → requiere caja.aprobar_bancarios
 *   - super_admin pasa todo
 *
 * Si la selección incluye recibos que el usuario NO puede aprobar,
 * NINGÚN recibo se aprueba (transacción atómica) y se retorna AppError 403
 * listando los conflictivos.
 *
 * Inserta una fila en Trazabilidad por cada recibo aprobado.
 *
 * @param {number[]} reciboIds
 * @param {Usuario} usuario  El usuario logueado (con rol cargado)
 * @param {string|null} observacion
 * @returns {{ aprobados:number, recibos:ReciboCaja[] }}
 */
async function aprobarRecibos(reciboIds, usuario, observacion = null) {
  if (!Array.isArray(reciboIds) || reciboIds.length === 0) {
    throw new AppError('Debe enviar al menos un reciboId', 400);
  }

  const p = permisosCaja(usuario);
  if (!p.efectivo && !p.bancarios) {
    throw new AppError('No tienes permisos para aprobar recibos', 403);
  }

  const transaction = await sequelize.transaction();
  try {
    const recibos = await ReciboCaja.findAll({
      where: { id: reciboIds, estadoCuadre: 'PENDIENTE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (recibos.length === 0) {
      await transaction.rollback();
      throw new AppError('Ningún recibo pendiente encontrado en los IDs provistos', 400);
    }

    // Validación de permiso por forma de pago
    const conflictivos = [];
    for (const r of recibos) {
      const esEfectivo = FORMAS_EFECTIVO.includes(r.formaPago);
      const esBancario = FORMAS_BANCARIAS.includes(r.formaPago);
      const puede =
        p.superAdmin ||
        (esEfectivo && p.efectivo) ||
        (esBancario && p.bancarios);
      if (!puede) conflictivos.push({ id: r.id, numero: r.numeroRecibo, formaPago: r.formaPago });
    }

    if (conflictivos.length > 0) {
      await transaction.rollback();
      const lista = conflictivos.map(c => `${c.numero} (${c.formaPago})`).join(', ');
      const rolNecesario = conflictivos.some(c => FORMAS_BANCARIAS.includes(c.formaPago))
        ? 'CARTERA (revisa transferencias/consignaciones)'
        : 'CAJERO (aprueba efectivo)';
      throw new AppError(
        `No puedes aprobar estos recibos por su forma de pago. Requiere rol ${rolNecesario}: ${lista}`,
        403
      );
    }

    const ahora = new Date();
    await ReciboCaja.update(
      {
        estadoCuadre: 'APROBADO',
        aprobadoPor: usuario.id,
        aprobadoAt: ahora,
        observacionCajero: observacion
      },
      { where: { id: recibos.map(r => r.id) }, transaction }
    );

    // Trazabilidad por recibo
    const trazas = recibos.map(r => ({
      afiliadoId: r.afiliadoId,
      tipo: 'APROBACION_RECIBO',
      descripcion: `Recibo ${r.numeroRecibo} (${r.formaPago}) aprobado en cuadre de caja` +
        (observacion ? ` — ${observacion}` : ''),
      usuarioId: usuario.id
    }));
    await Trazabilidad.bulkCreate(trazas, { transaction });

    await transaction.commit();
    logger.info(`[ReciboCaja] ${recibos.length} recibo(s) aprobados por usuario ${usuario.id}`);

    const refreshed = await ReciboCaja.findAll({
      where: { id: recibos.map(r => r.id) },
      include: INCLUDE_RECIBO_COMPLETO
    });
    return { aprobados: recibos.length, recibos: refreshed };
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
}

/**
 * Lista afiliaciones con pago POSFECHADO pendientes de cobro (sin recibo aún)
 * filtrando por asesor (o todas para super_admin).
 */
async function listarPosfechadosPendientes(usuario, params = {}) {
  const where = { formaPago: 'POSFECHADO' };
  if (!usuario.es_super_admin) where.asesorId = usuario.id;

  // Excluir los que ya tienen recibo
  const conRecibo = await ReciboCaja.findAll({ attributes: ['afiliadoId'] });
  const idsConRecibo = conRecibo.map(r => r.afiliadoId);
  if (idsConRecibo.length > 0) where.id = { [Op.notIn]: idsConRecibo };

  // Filtro de fecha tentativa opcional
  if (params.fechaHasta) {
    where.fechaPagoTentativa = { [Op.lte]: new Date(params.fechaHasta) };
  }

  return Afiliado.findAll({
    where,
    attributes: [
      'id', 'numeroDocumento', 'primerNombre', 'segundoNombre',
      'primerApellido', 'segundoApellido', 'celular',
      'formaPago', 'valorRecibido', 'referenciaPago1', 'referenciaPago2',
      'fechaPagoTentativa', 'asesorId', 'createdAt'
    ],
    order: [['fechaPagoTentativa', 'ASC'], ['createdAt', 'DESC']]
  });
}

/**
 * Obtiene un recibo por ID con todos sus includes, validando acceso del usuario.
 */
async function getReciboById(id, usuario) {
  const recibo = await ReciboCaja.findByPk(id, { include: INCLUDE_RECIBO_COMPLETO });
  if (!recibo) throw new AppError('Recibo no encontrado', 404);

  if (!usuario.es_super_admin) {
    const permisos = typeof usuario.rol?.permisos === 'string'
      ? JSON.parse(usuario.rol.permisos)
      : (usuario.rol?.permisos || {});
    const pCaja = permisos.caja || {};
    const esPropio = recibo.asesorId === usuario.id;
    const puedeVerTodos = pCaja.ver_cuadre || pCaja.aprobar_recibos;
    if (!esPropio && !puedeVerTodos) {
      throw new AppError('No tienes permiso para ver este recibo', 403);
    }
  }
  return recibo;
}

module.exports = {
  formatearConsecutivo,
  generarConsecutivo,
  crearReciboParaAfiliacion,
  cobrarPosfechado,
  listarRecibosAsesor,
  listarRecibosParaCuadre,
  aprobarRecibos,
  listarPosfechadosPendientes,
  getReciboById,
  permisosCaja,
  FORMAS_PAGO_QUE_GENERAN_RECIBO,
  FORMAS_EFECTIVO,
  FORMAS_BANCARIAS
};
