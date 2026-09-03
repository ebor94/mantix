// ============================================
// src/services/entregaEfectivo.service.js
// Lógica del acta de recibido de efectivo con confirmación OTP.
// ============================================
const { Op } = require('sequelize');
const db = require('../models');
const otpStore = require('../utils/otpStore');
const { sendOTP } = require('./whatsappService');
const maskCelular = require('../utils/maskCelular');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const { EntregaEfectivo, Usuario, Rol, ReciboCaja } = db;

const ASESOR_ATTRS = ['id', 'nombre', 'apellido'];
const otpKey = (id) => `entrega:${id}`;

function generarOtp() {
  return String(Math.floor(10000 + Math.random() * 90000)); // 5 dígitos
}

// Lockout de intentos fallidos por entrega, para evitar fuerza bruta sobre el
// OTP (otpStore.verify no consume el código en un intento fallido). Se
// mantiene en memoria, contenido a este módulo, sin dependencias nuevas.
const MAX_INTENTOS_OTP = 5;
const intentosFallidos = new Map();

function _resetIntentos(id) {
  intentosFallidos.delete(String(id));
}

function _registrarIntentoFallido(id) {
  const key = String(id);
  const actuales = (intentosFallidos.get(key) || 0) + 1;
  if (actuales >= MAX_INTENTOS_OTP) {
    // otpStore no expone un "delete" explícito; sobreescribir con un valor
    // que el usuario nunca podrá enviar invalida el código actual de forma
    // efectiva (debe usar "Reenviar código" para obtener uno nuevo).
    otpStore.set(otpKey(id), `LOCKED-${Date.now()}-${Math.random()}`);
    _resetIntentos(id);
    throw new AppError('Demasiados intentos. Solicita reenviar el código.', 429);
  }
  intentosFallidos.set(key, actuales);
}

// Lista de asesores (rol cuyo nombre contiene "ASESOR") para el dropdown.
async function listarAsesoresDisponibles() {
  const asesores = await Usuario.findAll({
    where: { activo: true },
    attributes: [...ASESOR_ATTRS, 'telefono'],
    include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'], required: true }],
    order: [['nombre', 'ASC'], ['apellido', 'ASC']]
  });
  return asesores
    .filter((u) => /ASESOR/i.test(u.rol?.nombre || ''))
    .map((u) => ({
      id: u.id,
      nombre: u.nombre,
      apellido: u.apellido,
      celularMasked: maskCelular(u.telefono),
      tieneTelefono: !!(u.telefono && String(u.telefono).replace(/\D/g, '').length >= 10)
    }));
}

async function _generarYEnviarOtp(entregaId, celular) {
  const otp = generarOtp();
  otpStore.set(otpKey(entregaId), otp);
  try {
    await sendOTP(celular, otp, 'Recibido de efectivo Serfunorte');
  } catch (err) {
    logger.warn(`[entregaEfectivo] Falló envío OTP entrega ${entregaId}: ${err?.message || err}`);
  }
}

async function registrarEntrega({ asesorId, monto, observacion, cajeroId }) {
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    throw new AppError('El monto debe ser mayor a cero', 400);
  }
  const asesor = await Usuario.findByPk(asesorId, {
    include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }]
  });
  if (!asesor) throw new AppError('Asesor no encontrado', 404);
  if (!/ASESOR/i.test(asesor.rol?.nombre || '')) {
    throw new AppError('El usuario seleccionado no es un asesor', 400);
  }
  const celular = asesor.telefono;
  if (!celular || String(celular).replace(/\D/g, '').length < 10) {
    throw new AppError('El asesor no tiene un celular válido registrado; actualízalo antes de recibir el efectivo', 400);
  }

  const entrega = await EntregaEfectivo.create({
    asesorId,
    cajeroId,
    monto: Math.round(montoNum),
    celular,
    estado: 'PENDIENTE',
    observacion: observacion || null
  });

  await _generarYEnviarOtp(entrega.id, celular);
  return { entrega, celularMasked: maskCelular(celular) };
}

// Registra una entrega de efectivo a partir de recibos EFECTIVO seleccionados
// en el cuadre. Valida forma de pago, asesor único y no-ya-recibidos; calcula
// el monto; crea la entrega PENDIENTE con recibosIds y dispara el OTP.
async function registrarEntregaDesdeRecibos({ recibosIds, cajeroId }) {
  if (!Array.isArray(recibosIds) || recibosIds.length === 0) {
    throw new AppError('Debe seleccionar al menos un recibo', 400);
  }
  const recibos = await ReciboCaja.findAll({ where: { id: { [Op.in]: recibosIds } } });
  if (recibos.length !== recibosIds.length) {
    throw new AppError('Algunos recibos seleccionados no existen', 400);
  }
  if (recibos.some((r) => r.formaPago !== 'EFECTIVO')) {
    throw new AppError('Solo se puede recibir efectivo de recibos con forma de pago EFECTIVO', 400);
  }
  const yaRecibidos = recibos.filter((r) => r.reciboEntregaId != null);
  if (yaRecibidos.length) {
    throw new AppError(`${yaRecibidos.length} recibo(s) ya fueron recibidos en otra entrega`, 400);
  }
  const asesorIds = [...new Set(recibos.map((r) => Number(r.asesorId)))];
  if (asesorIds.length !== 1) {
    throw new AppError('Los recibos deben ser de un solo asesor', 400);
  }
  const asesor = await Usuario.findByPk(asesorIds[0]);
  if (!asesor) throw new AppError('Asesor no encontrado', 404);
  const celular = asesor.telefono;
  if (!celular || String(celular).replace(/\D/g, '').length < 10) {
    throw new AppError('El asesor no tiene un celular válido registrado; actualízalo antes de recibir el efectivo', 400);
  }
  const monto = recibos.reduce((s, r) => s + Number(r.valor || 0), 0);
  if (monto <= 0) throw new AppError('El total de efectivo debe ser mayor a cero', 400);

  const entrega = await EntregaEfectivo.create({
    asesorId: asesor.id,
    cajeroId,
    monto: Math.round(monto),
    celular,
    estado: 'PENDIENTE',
    recibosIds,
    observacion: `Recibos: ${recibos.map((r) => r.numeroRecibo || r.id).join(', ')}`
  });

  await _generarYEnviarOtp(entrega.id, celular);
  return {
    entrega,
    celularMasked: maskCelular(celular),
    asesorNombre: [asesor.nombre, asesor.apellido].filter(Boolean).join(' ')
  };
}

async function confirmarEntrega({ id, codigo }) {
  const entrega = await EntregaEfectivo.findByPk(id);
  if (!entrega) throw new AppError('Entrega no encontrada', 404);
  if (entrega.estado === 'CONFIRMADA') {
    throw new AppError('La entrega ya está confirmada', 400);
  }
  if (!codigo || !otpStore.verify(otpKey(id), String(codigo).trim())) {
    _registrarIntentoFallido(id); // puede lanzar AppError 429 si se agotaron los intentos
    throw new AppError('Código incorrecto o expirado', 401);
  }
  _resetIntentos(id);

  await db.sequelize.transaction(async (t) => {
    await entrega.update({ estado: 'CONFIRMADA', fechaConfirmacion: new Date() }, { transaction: t });
    const ids = Array.isArray(entrega.recibosIds) ? entrega.recibosIds : [];
    if (ids.length) {
      const yaTomados = await ReciboCaja.count({
        where: { id: { [Op.in]: ids }, reciboEntregaId: { [Op.ne]: null } },
        transaction: t
      });
      if (yaTomados > 0) {
        throw new AppError('Algunos recibos ya fueron recibidos por otra entrega. Recarga el cuadre.', 409);
      }
      await ReciboCaja.update(
        { reciboEntregaId: entrega.id },
        { where: { id: { [Op.in]: ids }, reciboEntregaId: null }, transaction: t }
      );
    }
  });

  return entrega;
}

async function reenviarOtp(id) {
  const entrega = await EntregaEfectivo.findByPk(id);
  if (!entrega) throw new AppError('Entrega no encontrada', 404);
  if (entrega.estado === 'CONFIRMADA') {
    throw new AppError('La entrega ya está confirmada', 400);
  }
  _resetIntentos(id); // código nuevo → intentos frescos
  await _generarYEnviarOtp(entrega.id, entrega.celular);
  return { celularMasked: maskCelular(entrega.celular) };
}

function _rangoFechas(desde, hasta) {
  const rango = {};
  if (desde) rango[Op.gte] = new Date(`${desde}T00:00:00`);
  if (hasta) rango[Op.lte] = new Date(`${hasta}T23:59:59.999`);
  return Object.keys(rango).length ? rango : undefined;
}

async function listarEntregas({ desde, hasta, asesorId, soloAsesorId } = {}) {
  const where = {};
  const createdAt = _rangoFechas(desde, hasta);
  if (createdAt) where.createdAt = createdAt;
  if (soloAsesorId) where.asesorId = soloAsesorId;
  else if (asesorId) where.asesorId = asesorId;

  return EntregaEfectivo.findAll({
    where,
    include: [
      { model: Usuario, as: 'asesor', attributes: ASESOR_ATTRS },
      { model: Usuario, as: 'cajero', attributes: ASESOR_ATTRS }
    ],
    order: [['createdAt', 'DESC']]
  });
}

async function obtenerEntrega(id) {
  const entrega = await EntregaEfectivo.findByPk(id, {
    include: [
      { model: Usuario, as: 'asesor', attributes: ASESOR_ATTRS },
      { model: Usuario, as: 'cajero', attributes: ASESOR_ATTRS }
    ]
  });
  if (!entrega) throw new AppError('Entrega no encontrada', 404);
  return entrega;
}

module.exports = {
  listarAsesoresDisponibles,
  registrarEntrega,
  registrarEntregaDesdeRecibos,
  confirmarEntrega,
  reenviarOtp,
  listarEntregas,
  obtenerEntrega,
  generarOtp
};
