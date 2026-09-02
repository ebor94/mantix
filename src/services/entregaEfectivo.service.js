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

const { EntregaEfectivo, Usuario, Rol } = db;

const ASESOR_ATTRS = ['id', 'nombre', 'apellido'];
const otpKey = (id) => `entrega:${id}`;

function generarOtp() {
  return String(Math.floor(10000 + Math.random() * 90000)); // 5 dígitos
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
      telefono: u.telefono || null,
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

async function confirmarEntrega({ id, codigo }) {
  const entrega = await EntregaEfectivo.findByPk(id);
  if (!entrega) throw new AppError('Entrega no encontrada', 404);
  if (entrega.estado === 'CONFIRMADA') {
    throw new AppError('La entrega ya está confirmada', 400);
  }
  if (!codigo || !otpStore.verify(otpKey(id), String(codigo).trim())) {
    throw new AppError('Código incorrecto o expirado', 401);
  }
  await entrega.update({ estado: 'CONFIRMADA', fechaConfirmacion: new Date() });
  return entrega;
}

async function reenviarOtp(id) {
  const entrega = await EntregaEfectivo.findByPk(id);
  if (!entrega) throw new AppError('Entrega no encontrada', 404);
  if (entrega.estado === 'CONFIRMADA') {
    throw new AppError('La entrega ya está confirmada', 400);
  }
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
  confirmarEntrega,
  reenviarOtp,
  listarEntregas,
  obtenerEntrega,
  generarOtp
};
