// ============================================
// src/controllers/reciboCaja.controller.js
// HTTP handlers para el módulo de recibos de caja.
// ============================================
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { Usuario, Afiliado, ReciboCaja } = require('../models');
const reciboService = require('../services/reciboCaja.service');
const pdfService = require('../services/pdfService');
const { sendImagenRecibo } = require('../services/whatsappService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Construye la URL pública absoluta del PDF usando PUBLIC_API_URL.
 */
function buildPublicPdfUrl(pdfUrlRelativa) {
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!base) return pdfUrlRelativa;
  return `${base}${pdfUrlRelativa}`;
}

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

/**
 * POST /api/recibos/:id/reenviar-whatsapp
 * Reenvía (o envía por primera vez) el PDF del recibo por WhatsApp.
 * - Si el recibo ya tiene pdfUrl y el archivo existe, reutiliza el PDF.
 * - Si no tiene PDF todavía, lo genera primero.
 * Acceso: el propio asesor del recibo o roles con ver_cuadre / super_admin.
 */
async function reenviarWhatsapp(req, res, next) {
  try {
    const reciboId = parseInt(req.params.id, 10);
    const recibo = await ReciboCaja.findByPk(reciboId, {
      include: [{ model: Usuario, as: 'asesor' }]
    });
    if (!recibo) throw new AppError('Recibo no encontrado', 404);

    // Control de acceso: el asesor dueño, cualquier rol con permiso en caja, o super_admin
    const permisos = reciboService.permisosCaja(req.usuario);
    const esAsesorDueno = recibo.asesorId === req.usuario.id;
    const tieneCualquierPermisoCaja = permisos.efectivo || permisos.bancarios || permisos.all || permisos.superAdmin;
    if (!esAsesorDueno && !tieneCualquierPermisoCaja) {
      throw new AppError('Sin permisos para reenviar este recibo', 403);
    }

    const afiliado = await Afiliado.findByPk(recibo.afiliadoId);
    if (!afiliado) throw new AppError('Afiliado del recibo no encontrado', 404);

    const reciboJson   = recibo.toJSON();
    const afiliadoJson = afiliado.toJSON();
    const asesorJson   = recibo.asesor ? recibo.asesor.toJSON() : null;

    // Asegurar PDF existente (solo queda para descarga desde /mis-recibos)
    let pdfUrl = recibo.pdfUrl;
    const pdfFilePath = pdfUrl ? path.join(__dirname, '../../', pdfUrl) : null;
    if (!pdfFilePath || !fs.existsSync(pdfFilePath)) {
      const pdfInfo = await pdfService.generarReciboCajaPDF(reciboJson, afiliadoJson, asesorJson);
      pdfUrl = pdfInfo.url;
      await recibo.update({ pdfUrl });
    }

    // Generar imagen-voucher (se regenera siempre para reflejar datos actuales).
    // Se descarga en el servidor (uploads/recibos/{numero}.png) y se envía
    // como link en image.link de la plantilla texto_imagen_generico.
    const imgInfo = await pdfService.generarReciboCajaImagen(
      reciboJson, afiliadoJson, asesorJson
    );
    const urlImagenPublica = buildPublicPdfUrl(imgInfo.url);

    logger.info(`[ReciboCaja] Reenvío WhatsApp recibo ${recibo.numeroRecibo} → ${urlImagenPublica}`);

    // Enviar la imagen al cliente usando la plantilla 1msg (sin fallback).
    const result = await sendImagenRecibo(
      afiliado.celular,
      urlImagenPublica,
      recibo.numeroRecibo,
      recibo.valor
    );

    if (result.success) {
      await recibo.update({ whatsappEnviado: true, whatsappEnviadoAt: new Date() });
      return res.json({
        success: true,
        message: `WhatsApp enviado a ${afiliado.celular}`,
        numeroRecibo: recibo.numeroRecibo
      });
    }

    // El envío falló pero no queremos lanzar 500 — retornamos 200 con bandera
    return res.json({
      success: false,
      message: 'PDF generado pero falló el envío de WhatsApp',
      error: result.error,
      pdfUrl: buildPublicPdfUrl(pdfUrl)
    });
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
  getAsesoresConPrefijo,
  reenviarWhatsapp
};
