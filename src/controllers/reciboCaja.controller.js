// ============================================
// src/controllers/reciboCaja.controller.js
// HTTP handlers para el módulo de recibos de caja.
// ============================================
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { Usuario } = require('../models');
const reciboService = require('../services/reciboCaja.service');
const AppError = require('../utils/AppError');

/**
 * GET /api/recibos/mios
 * Recibos del asesor autenticado. Filtros opcionales: ?fecha, ?fechaDesde, ?fechaHasta
 */
async function getMisRecibos(req, res, next) {
  try {
    const { fecha, fechaDesde, fechaHasta } = req.query;
    const data = await reciboService.listarRecibosAsesor(
      req.usuario.id,
      { fecha, fechaDesde, fechaHasta }
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/**
 * GET /api/recibos/cuadre
 * Recibos para el cuadre. Filtros:
 *   ?fecha, ?fechaDesde, ?fechaHasta, ?asesorId, ?estado, ?tipo=efectivo|bancarios|todos
 * El listado se restringe automáticamente según el permiso del usuario:
 *   - CAJERO (aprobar_efectivo)  → solo EFECTIVO
 *   - CARTERA (aprobar_bancarios) → solo TRANSFERENCIA / CORRESPONSAL / POSFECHADO_COBRADO
 *   - Admin / super_admin         → todos
 * Permiso: caja.ver_cuadre
 */
async function getCuadre(req, res, next) {
  try {
    const { fecha, fechaDesde, fechaHasta, asesorId, estado, tipo } = req.query;
    const data = await reciboService.listarRecibosParaCuadre(req.usuario, {
      fecha,
      fechaDesde,
      fechaHasta,
      asesorId: asesorId ? parseInt(asesorId, 10) : undefined,
      estado,
      tipo
    });
    // Incluye los permisos resueltos para que el frontend pinte la UI según el rol
    const permisos = reciboService.permisosCaja(req.usuario);
    res.json({ success: true, data, permisos });
  } catch (err) { next(err); }
}

/**
 * POST /api/recibos/aprobar
 * Aprueba uno o varios recibos pendientes.
 * Valida en el servicio el permiso por forma de pago:
 *   - EFECTIVO requiere caja.aprobar_efectivo (rol CAJERO)
 *   - TRANSFERENCIA/CORRESPONSAL/POSFECHADO_COBRADO requiere caja.aprobar_bancarios (rol CARTERA)
 * Body: { reciboIds: number[], observacion?: string }
 */
async function aprobarRecibos(req, res, next) {
  try {
    const { reciboIds, observacion } = req.body;
    const result = await reciboService.aprobarRecibos(
      reciboIds, req.usuario, observacion || null
    );
    res.json({
      success: true,
      message: `${result.aprobados} recibo(s) aprobado(s)`,
      data: result.recibos
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/recibos/cobrar-posfechado/:afiliadoId
 * Marca un pago POSFECHADO como cobrado, asignando consecutivo y emitiendo el recibo.
 * Body: { banco?, referencia?, observacion?, soporteUrl? }
 * Permiso: caja.cobrar_posfechado
 */
async function cobrarPosfechado(req, res, next) {
  try {
    const recibo = await reciboService.cobrarPosfechado(
      parseInt(req.params.afiliadoId, 10),
      req.usuario,
      req.body || {}
    );
    res.status(201).json({
      success: true,
      message: `Recibo ${recibo.numeroRecibo} emitido por cobro de posfechado`,
      data: recibo
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/recibos/posfechados-pendientes
 * Lista afiliaciones del asesor con pago POSFECHADO aún no cobrado.
 * Permiso: caja.cobrar_posfechado
 */
async function getPosfechadosPendientes(req, res, next) {
  try {
    const data = await reciboService.listarPosfechadosPendientes(
      req.usuario,
      req.query || {}
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/**
 * GET /api/recibos/:id
 * Detalle de un recibo (con validación de acceso).
 */
async function getReciboById(req, res, next) {
  try {
    const recibo = await reciboService.getReciboById(
      parseInt(req.params.id, 10),
      req.usuario
    );
    res.json({ success: true, data: recibo });
  } catch (err) { next(err); }
}

/**
 * GET /api/recibos/:id/pdf
 * Descarga del PDF del recibo. Valida acceso antes de servir el archivo.
 */
async function descargarPDF(req, res, next) {
  try {
    const recibo = await reciboService.getReciboById(
      parseInt(req.params.id, 10),
      req.usuario
    );
    if (!recibo.pdfUrl) {
      throw new AppError('El PDF de este recibo aún no se ha generado', 404);
    }
    const filePath = path.join(__dirname, '../../', recibo.pdfUrl);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Archivo PDF no encontrado en el servidor', 404);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${recibo.numeroRecibo}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
}

/**
 * GET /api/recibos/asesores
 * Lista los usuarios activos que tienen prefijo_recibo configurado
 * (= asesores que emiten recibos). Se usa para poblar selectores en
 * la vista de cuadre y reportes.
 * Permiso: caja.ver_cuadre
 */
async function getAsesoresConPrefijo(req, res, next) {
  try {
    const asesores = await Usuario.findAll({
      where: {
        prefijo_recibo: { [Op.ne]: null },
        activo: 1
      },
      attributes: ['id', 'nombre', 'apellido', 'prefijo_recibo'],
      order: [['prefijo_recibo', 'ASC']]
    });
    res.json({ success: true, data: asesores });
  } catch (err) { next(err); }
}

module.exports = {
  getMisRecibos,
  getCuadre,
  aprobarRecibos,
  cobrarPosfechado,
  getPosfechadosPendientes,
  getReciboById,
  descargarPDF,
  getAsesoresConPrefijo
};
