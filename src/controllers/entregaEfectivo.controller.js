// ============================================
// src/controllers/entregaEfectivo.controller.js
// ============================================
const service = require('../services/entregaEfectivo.service');
const AppError = require('../utils/AppError');

// Mismo criterio que el middleware requirePermiso: lee req.usuario.rol.permisos
// (JSON `{ [modulo]: { [accion]: true } }`), poblado por `auth` via include Rol.
function puedeVerTodas(usuario) {
  if (!usuario) return false;
  if (usuario.es_super_admin) return true;
  const raw = usuario.rol?.permisos;
  const permisos = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  return permisos?.caja?.ver_cuadre === true;
}

// Gate mínimo para los endpoints de lectura (GET / y GET /:id/comprobante-pdf):
// solo super_admin, caja.ver_cuadre o caja.ver_propios pueden entrar. El filtro
// de ownership en listar()/comprobantePdf() sigue siendo la segunda capa.
function requireVerEntregas(req, res, next) {
  const usuario = req.usuario;
  if (!usuario) return next(new AppError('No autorizado', 403));
  if (usuario.es_super_admin) return next();
  const raw = usuario.rol?.permisos;
  const permisos = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  const puede = permisos?.caja?.ver_cuadre === true || permisos?.caja?.ver_propios === true;
  if (!puede) return next(new AppError('No autorizado', 403));
  return next();
}

async function asesores(req, res, next) {
  try {
    const data = await service.listarAsesoresDisponibles();
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

async function crear(req, res, next) {
  try {
    const { asesorId, monto, observacion } = req.body || {};
    if (!asesorId) throw new AppError('Debe seleccionar el asesor', 400);
    const { entrega, celularMasked } = await service.registrarEntrega({
      asesorId,
      monto,
      observacion,
      cajeroId: req.usuario.id
    });
    res.status(201).json({
      success: true,
      message: `Código enviado al WhatsApp del asesor (${celularMasked})`,
      data: { id: entrega.id, estado: entrega.estado, monto: entrega.monto, celularMasked }
    });
  } catch (error) { next(error); }
}

async function crearDesdeRecibos(req, res, next) {
  try {
    const { recibosIds } = req.body || {};
    if (!Array.isArray(recibosIds) || recibosIds.length === 0) {
      throw new AppError('Debe seleccionar al menos un recibo', 400);
    }
    const { entrega, celularMasked, asesorNombre } = await service.registrarEntregaDesdeRecibos({
      recibosIds,
      cajeroId: req.usuario.id,
      usuario: req.usuario
    });
    res.status(201).json({
      success: true,
      message: `Código enviado al WhatsApp del asesor (${celularMasked})`,
      data: { id: entrega.id, estado: entrega.estado, monto: entrega.monto, celularMasked, asesorNombre }
    });
  } catch (error) { next(error); }
}

async function confirmar(req, res, next) {
  try {
    const { codigo } = req.body || {};
    if (!codigo) throw new AppError('Ingrese el código de confirmación', 400);
    const entrega = await service.confirmarEntrega({ id: req.params.id, codigo });
    res.json({ success: true, message: 'Entrega confirmada', data: entrega });
  } catch (error) { next(error); }
}

async function reenviar(req, res, next) {
  try {
    const { celularMasked } = await service.reenviarOtp(req.params.id);
    res.json({ success: true, message: `Código reenviado (${celularMasked})` });
  } catch (error) { next(error); }
}

async function listar(req, res, next) {
  try {
    const { desde, hasta, asesorId } = req.query;
    // Si el usuario NO tiene ver_cuadre pero sí ver_propios, solo ve las suyas.
    const soloAsesorId = puedeVerTodas(req.usuario) ? null : req.usuario.id;
    const data = await service.listarEntregas({ desde, hasta, asesorId, soloAsesorId });
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

async function comprobantePdf(req, res, next) {
  try {
    const entrega = await service.obtenerEntrega(req.params.id);
    if (!puedeVerTodas(req.usuario) && entrega.asesorId !== req.usuario.id) {
      throw new AppError('No tienes permiso para ver este comprobante', 403);
    }
    if (entrega.estado !== 'CONFIRMADA') {
      throw new AppError('Solo hay comprobante de entregas confirmadas', 400);
    }
    const pdf = require('../services/entregaEfectivoPdf');
    const buffer = await pdf.generar(entrega);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recibido-${entrega.id}.pdf"`);
    res.send(buffer);
  } catch (error) { next(error); }
}

module.exports = { asesores, crear, crearDesdeRecibos, confirmar, reenviar, listar, comprobantePdf, requireVerEntregas };
