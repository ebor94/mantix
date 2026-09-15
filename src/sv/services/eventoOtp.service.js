/**
 * sv/services/eventoOtp.service.js — SP-3
 * Flujo OTP para que el dueño-asesor edite su evento pasando por Google Chat.
 *
 * El asesor dueño de un evento no puede editarlo con PUT directo (guard
 * `esAsesor` en eventosAgenda.service#actualizar). En su lugar:
 *   1) solicitar()  → genera OTP de 6 dígitos, guarda sólo su hash sha256,
 *                     envía el código al webhook de Google Chat (jefes lo leen)
 *                     y guarda el snapshot del cambio propuesto.
 *   2) confirmar()  → valida hash + expiración + intentos, y si es correcto
 *                     aplica el cambio invocando eventosAgenda.actualizar con
 *                     un actor "jefe virtual" (rol SUPER_ADMIN) que sí pasa el
 *                     guard de esAsesor sin tocar ese service existente.
 *   3) cleanupVencidos() → job de limpieza (Task 6) borra OTPs viejos.
 *
 * Nunca se persiste el token en claro (sólo sha256(token) en otp_hash) y
 * nunca se loguea el webhook ni el OTP fuera del texto que arma gchat.enviarOtp.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { SvEventoOtp, SvEventoAgenda, SvUsuario } = require('../models');
const eventosAgenda = require('./eventosAgenda.service');
const gchat = require('./googleChat.service');
const { ROLES } = require('../config/constants');

const EXPIRACION_MIN = parseInt(process.env.OTP_EXPIRACION_MIN || '10', 10);
const MAX_ACTIVOS    = parseInt(process.env.OTP_MAX_ACTIVOS_POR_USR_EVENTO || '3', 10);
const MAX_INTENTOS   = parseInt(process.env.OTP_MAX_INTENTOS || '3', 10);

function err(msg, code) { const e = new Error(msg); e.code = code; return e; }
function sha256(s) { return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'); }
function esAsesor(actor) {
  const c = actor?.rol?.rol_codigo;
  return c === ROLES.ASESOR || c === ROLES.AGENTE_SVC;
}

async function solicitar({ eventoId, cambios, actor }) {
  if (!esAsesor(actor)) throw err('Solo el dueño-asesor solicita OTP; los jefes editan directo', 'FORBIDDEN');

  const ev = await SvEventoAgenda.findByPk(eventoId);
  if (!ev) throw err('Evento no encontrado', 'NOT_FOUND');
  if (ev.evento_asesor_id !== actor.usr_id) throw err('Solo el dueño del evento puede solicitar OTP', 'FORBIDDEN');

  const ahora = new Date();
  const activos = await SvEventoOtp.count({
    where: {
      otp_evento_id:   eventoId,
      otp_usr_id:      actor.usr_id,
      otp_consumed_at: null,
      otp_expires_at:  { [Op.gt]: ahora }
    }
  });
  if (activos >= MAX_ACTIVOS) throw err(`Máximo ${MAX_ACTIVOS} OTPs activos por evento`, 'RATE_LIMIT');

  const otpPlano = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  const expires  = new Date(ahora.getTime() + EXPIRACION_MIN * 60_000);

  const row = await SvEventoOtp.create({
    otp_evento_id:    eventoId,
    otp_usr_id:       actor.usr_id,
    otp_hash:         sha256(otpPlano),
    otp_expires_at:   expires,
    otp_payload_json: cambios
  });

  const usuario = await SvUsuario.findByPk(actor.usr_id, {
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido']
  });

  try {
    await gchat.enviarOtp({ evento: ev, usuario, cambios, otp: otpPlano });
  } catch (e) {
    await row.destroy(); // rollback: no dejar un OTP huérfano si no se pudo notificar
    throw e;
  }

  return { otp_id: row.otp_id, expires_at: expires, canal: 'google_chat' };
}

async function confirmar({ eventoId, otpId, otp, actor }) {
  if (!esAsesor(actor)) throw err('Solo el dueño-asesor confirma OTP', 'FORBIDDEN');

  const row = await SvEventoOtp.findByPk(otpId);
  if (!row || row.otp_evento_id !== eventoId || row.otp_usr_id !== actor.usr_id) {
    throw err('OTP no encontrado', 'NOT_FOUND');
  }
  if (row.otp_consumed_at) throw err('OTP ya consumido o invalidado', 'OTP_CONSUMED');
  if (row.otp_expires_at.getTime() < Date.now()) throw err('OTP expirado', 'OTP_EXPIRED');

  if (row.otp_hash !== sha256(otp)) {
    const nuevos = row.otp_intentos + 1;
    const patch = { otp_intentos: nuevos };
    if (nuevos >= MAX_INTENTOS) {
      patch.otp_consumed_at = new Date(); // invalidado tras agotar intentos
      console.log(JSON.stringify({ tag: 'OTP_FAILED_MAX', evento_id: eventoId, otp_id: otpId }));
    }
    await row.update(patch);
    throw err('Código inválido', 'OTP_INVALID');
  }

  // Aplicar el cambio con el service normal, con actor efectivo = jefe virtual.
  // El rol SUPER_ADMIN pasa el guard esAsesor de eventosAgenda.actualizar sin
  // ampliar permisos: el snapshot ya fue validado (dueño + payload) en solicitar().
  const jefeVirtual = { ...actor, rol: { rol_codigo: ROLES.SUPER_ADMIN } };
  const evento = await eventosAgenda.actualizar(eventoId, row.otp_payload_json || {}, jefeVirtual);
  await row.update({ otp_consumed_at: new Date() });

  console.log(JSON.stringify({
    tag: 'OTP_CONFIRMED',
    evento_id: eventoId,
    otp_id: otpId,
    latencia_solicitud_confirmar_s: Math.round((Date.now() - row.otp_created_at.getTime()) / 1000)
  }));

  return evento;
}

async function cleanupVencidos() {
  const limite = new Date(Date.now() - 24 * 3600 * 1000);
  const n = await SvEventoOtp.destroy({ where: { otp_expires_at: { [Op.lt]: limite } } });
  if (n) console.log(JSON.stringify({ tag: 'OTP_CLEANUP', borrados: n }));
  return n;
}

module.exports = { solicitar, confirmar, cleanupVencidos };
