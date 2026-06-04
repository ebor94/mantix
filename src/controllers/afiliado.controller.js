const afiliadoService = require('../services/afiliado.service');
const AppError = require('../utils/AppError');
const { sendAceptacion, sendOTP, sendImagenRecibo } = require('../services/whatsappService');
const { notificarNuevoVeolia, notificarCorreccionVeolia } = require('../services/googleChatService');
const { notificarCertificadoAfiliacion, notificarFirma } = require('../services/n8nService');
const pdfService = require('../services/pdfService');
const { Afiliado, ReciboCaja, Usuario } = require('../models');
const { Op } = require('sequelize');
const otpStore  = require('../utils/otpStore');
const { encodeId, decodeId } = require('../utils/hashId');
const logger = require('../utils/logger');

/**
 * Construye la URL pública del PDF de un recibo, usando la variable de
 * entorno PUBLIC_API_URL. En desarrollo (sin variable), retorna ruta relativa.
 */
function buildPublicPdfUrl(pdfUrlRelativa) {
  const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!base) return pdfUrlRelativa;
  return `${base}${pdfUrlRelativa}`;
}

/**
 * Fire-and-forget: genera el PDF del recibo recién emitido y lo envía
 * por WhatsApp al cliente. No bloquea la respuesta HTTP de la afiliación.
 */
async function emitirPdfYEnviarWhatsapp(afiliadoId) {
  try {
    const recibo = await ReciboCaja.findOne({
      where: { afiliadoId },
      include: [{ model: Usuario, as: 'asesor' }]
    });
    if (!recibo) return; // POSFECHADO u otra forma sin recibo

    const afiliado = await Afiliado.findByPk(afiliadoId);
    if (!afiliado) return;

    const reciboJson   = recibo.toJSON();
    const afiliadoJson = afiliado.toJSON();
    const asesorJson   = recibo.asesor ? recibo.asesor.toJSON() : null;

    // 1) Generar PDF — solo para que quede disponible en /mis-recibos
    const pdfInfo = await pdfService.generarReciboCajaPDF(reciboJson, afiliadoJson, asesorJson);
    await recibo.update({ pdfUrl: pdfInfo.url });

    // 2) Generar la imagen-voucher PNG. Se descarga en el servidor en
    //    uploads/recibos/{numeroRecibo}.png y queda accesible via PUBLIC_API_URL.
    const imgInfo = await pdfService.generarReciboCajaImagen(
      reciboJson, afiliadoJson, asesorJson
    );

    // 3) Enviar la imagen al cliente por WhatsApp usando la plantilla
    //    texto_imagen_generico (header=image.link, body=texto). El payload
    //    se construye exactamente como exige 1msg.
    const urlImagenPublica = buildPublicPdfUrl(imgInfo.url);
    const result = await sendImagenRecibo(
      afiliado.celular,
      urlImagenPublica,
      recibo.numeroRecibo,
      recibo.valor
    );

    if (result.success) {
      await recibo.update({
        whatsappEnviado: true,
        whatsappEnviadoAt: new Date()
      });
    }
  } catch (err) {
    logger.error('[ReciboCaja] Error en emitirPdfYEnviarWhatsapp:', err.message || err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFiles(req, body) {
  if (req.files?.soporte?.[0])             body.soportePago          = req.files.soporte[0].filename;
  if (req.files?.cedulaFrontal?.[0])       body.cedulaFrontal        = req.files.cedulaFrontal[0].filename;
  if (req.files?.cedulaReverso?.[0])       body.cedulaReverso        = req.files.cedulaReverso[0].filename;
  if (req.files?.contratoCompetencia?.[0]) body.contratoCompetencia  = req.files.contratoCompetencia[0].filename;

  if (Array.isArray(body.beneficiarios)) {
    body.beneficiarios = body.beneficiarios.map((b, i) => {
      const campo = `beneficiario_doc_${i}`;
      const file  = req.files?.[campo]?.[0];
      return file ? { ...b, documentoUrl: file.filename } : b;
    });
  }
}

/**
 * Enmascara un teléfono mostrando solo los últimos 3 dígitos.
 * "3143678786" → "3XX XXX X786"
 */
function maskPhone(phone) {
  const p = String(phone).replace(/\D/g, '');
  if (p.length < 4) return '****';
  const visible = p.slice(-3);
  const hidden = p.slice(0, -3).replace(/\d/g, 'X');
  // Formato: primero dígito + XX XXX X + últimos 3
  if (p.length === 10) {
    return `${p[0]}XX XXX X${visible}`;
  }
  return `${hidden}${visible}`;
}

/** Genera un OTP numérico de 5 dígitos */
function generarOtp() {
  return String(Math.floor(10000 + Math.random() * 90000));
}

// ── Registros ─────────────────────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    body.asesorId = req.usuario.id;
    body.origen = 'ASESOR';
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});
    // Fire-and-forget: generar PDF del recibo (si se emitió) y enviarlo por WhatsApp
    emitirPdfYEnviarWhatsapp(result.id).catch(() => {});

    // Fire-and-forget: solicitar envío de la firma electrónica via n8n
    // (solo canal ASESOR estándar; createPublico/Veolia NO debe disparar esto).
    notificarFirma(result.id).catch(() => {});

    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

async function createPublico(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    body.asesorId = null;
    body.origen = 'VEOLIA';
    body.notificacionRecibo = 0;
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    Afiliado.count({ where: { celular: body.celular } })
      .then(count => { if (count <= 1) sendAceptacion(body.celular).catch(() => {}); })
      .catch(() => {});
    // Notificación Google Chat — fire-and-forget
    notificarNuevoVeolia({ ...body, beneficiarios: body.beneficiarios || [] });
    res.status(201).json({ success: true, message: 'Afiliado registrado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

// ── Consultas ─────────────────────────────────────────────────────────────────

async function getAll(req, res, next) {
  try {
    const afiliados = await afiliadoService.getAllAfiliados();
    res.json({ success: true, data: afiliados });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /afiliados/por-hash/:hash
 * Carga pública de una afiliación rechazada/parcial usando el hash cifrado.
 * No requiere autenticación — el hash es el control de acceso.
 */
async function getByHash(req, res, next) {
  try {
    const id = decodeId(req.params.hash);
    if (!id) throw new AppError('Enlace inválido o expirado', 400);
    const afiliado = await afiliadoService.getAfiliadoById(id);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    if (!afiliado.rechazado && !afiliado.rechazadoParcial) {
      throw new AppError('Esta afiliación no está pendiente de corrección', 400);
    }
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    const usuario = req.usuario;
    if (!usuario.es_super_admin) {
      const permisos = typeof usuario.rol?.permisos === 'string'
        ? JSON.parse(usuario.rol.permisos)
        : (usuario.rol?.permisos || {});
      const pAfil = permisos.afiliaciones || {};
      if (!pAfil.ver_todas && afiliado.asesorId !== usuario.id) {
        throw new AppError('No tienes permiso para ver esta afiliación', 403);
      }
    }
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function getPendientes(req, res, next) {
  try {
    const afiliados = await afiliadoService.getPendientes(req.usuario);
    res.json({ success: true, data: afiliados });
  } catch (error) {
    next(error);
  }
}

async function getRechazados(req, res, next) {
  try {
    const afiliados = await afiliadoService.getRechazados(req.usuario);
    // Usar hashCorreccion guardado en BD; si no existe (ej. rechazo total), calcular al vuelo
    const data = afiliados.map(a => ({
      ...a.toJSON(),
      hash: a.hashCorreccion || encodeId(a.id)
    }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ── Aprobación / rechazo ──────────────────────────────────────────────────────

async function aprobar(req, res, next) {
  try {
    const afiliado = await afiliadoService.aprobarAfiliado(req.params.id, req.usuario.id);

    // Fire-and-forget: disparar webhook de n8n para generar/enviar el
    // certificado de afiliación. No bloquea la respuesta al frontend
    // y si falla solo queda en logs (la aprobación ya persistió).
    const aprobadoPor = [req.usuario?.nombre, req.usuario?.apellido]
      .filter(Boolean).join(' ').trim() || `user:${req.usuario?.id || 'desconocido'}`;
    notificarCertificadoAfiliacion(afiliado.id, aprobadoPor).catch((err) => {
      logger.warn(`[Afiliado.aprobar] Webhook certificado falló: ${err?.message || err}`);
    });

    res.json({ success: true, message: 'Registro aprobado exitosamente', data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function rechazar(req, res, next) {
  try {
    const { motivo } = req.body;
    const afiliado = await afiliadoService.rechazarAfiliado(req.params.id, motivo, req.usuario.id);
    res.json({ success: true, message: 'Registro rechazado', data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function rechazarParcial(req, res, next) {
  try {
    const { motivo, beneficiarioIds } = req.body;
    if (!Array.isArray(beneficiarioIds) || beneficiarioIds.length === 0) {
      throw new AppError('Debe enviar al menos un beneficiarioId', 400);
    }
    const afiliado = await afiliadoService.rechazarBeneficiarios(
      req.params.id, beneficiarioIds, motivo, req.usuario.id
    );

    res.json({ success: true, message: 'Beneficiarios inactivados', data: afiliado });
  } catch (error) {
    next(error);
  }
}

// ── Reenvío ───────────────────────────────────────────────────────────────────

async function reenviar(req, res, next) {
  try {
    const body = { ...req.body };

    // Cargar el origen del afiliado para decidir el flujo
    const afiliadoActual = await Afiliado.findByPk(req.params.id, {
      attributes: ['id', 'origen']
    });
    if (!afiliadoActual) throw new AppError('Afiliado no encontrado', 404);
    const esVeolia = afiliadoActual.origen === 'VEOLIA';

    // OTP solo es obligatorio para VEOLIA (cliente externo sin JWT).
    // El canal ASESOR se controla por sesión autenticada (req.usuario).
    if (esVeolia) {
      const { otp } = body;
      if (!otp) throw new AppError('Se requiere el código OTP para reenviar', 400);
      if (!otpStore.verify(`reenvio:${req.params.id}`, otp)) {
        return res.status(401).json({ success: false, message: 'Código OTP inválido o expirado' });
      }
    }

    // Eliminar otp del body antes de pasarlo al servicio (si vino)
    delete body.otp;
    extractFiles(req, body);
    const result = await afiliadoService.reenviarAfiliacion(req.params.id, body, req.usuario);

    // Notificación Google Chat — solo para correcciones de Veolia
    if (result.origen === 'VEOLIA') {
      notificarCorreccionVeolia(result);
    }

    res.json({ success: true, message: 'Afiliación reenviada para aprobación', data: result });
  } catch (error) {
    next(error);
  }
}

// ── OTP Consulta pública ──────────────────────────────────────────────────────

/**
 * POST /afiliados/consulta/solicitar-otp
 * Genera y envía OTP al celular del afiliado encontrado por documento.
 */
async function solicitarOtp(req, res, next) {
  try {
    const { numeroDocumento } = req.body;
    if (!numeroDocumento) throw new AppError('Número de documento requerido', 400);

    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento);
    if (!afiliado) throw new AppError('No se encontró un afiliado con ese número de documento', 404);

    const otp = generarOtp();
    otpStore.set(numeroDocumento, otp);

    await sendOTP(afiliado.celular, otp, 'Consulta de afiliado Serfunorte');

    res.json({
      success: true,
      celularMasked: maskPhone(afiliado.celular)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /afiliados/consulta/verificar-otp
 * Valida el OTP e retorna los datos del afiliado si es correcto.
 */
async function verificarOtp(req, res, next) {
  try {
    const { numeroDocumento, otp } = req.body;
    if (!numeroDocumento || !otp) throw new AppError('Documento y OTP son requeridos', 400);

    const valid = otpStore.verify(numeroDocumento, otp);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Código incorrecto o expirado' });
    }

    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

    // Trazabilidad
    afiliadoService.registrarConsulta(
      afiliado.id,
      req.usuario?.id || null,
      'Consulta verificada con OTP'
    ).catch(() => {});

    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /afiliados/:id/datos-contacto
 * Actualiza solo campos de contacto editables por el afiliado.
 */
async function actualizarDatosContacto(req, res, next) {
  try {
    const result = await afiliadoService.actualizarDatosContacto(
      req.params.id,
      req.body,
      req.usuario?.id || null
    );
    res.json({ success: true, message: 'Datos de contacto actualizados', data: result });
  } catch (error) {
    next(error);
  }
}

// ── OTP Reenvío ───────────────────────────────────────────────────────────────

/**
 * POST /afiliados/:id/solicitar-otp-reenvio
 * Genera y envía OTP al celular del afiliado para confirmar el reenvío.
 */
async function solicitarOtpReenvio(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);

    const otp = generarOtp();
    otpStore.set(`reenvio:${afiliado.id}`, otp);

    await sendOTP(afiliado.celular, otp, 'Reenvío de afiliación Serfunorte');

    res.json({
      success: true,
      celularMasked: maskPhone(afiliado.celular)
    });
  } catch (error) {
    next(error);
  }
}

// ── Beneficiarios (consulta pública) ─────────────────────────────────────────

async function consultarPorDocumento(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoByDocumento(req.params.numerodocumento);
    if (!afiliado) throw new AppError('Afiliado no encontrado', 404);
    afiliadoService.registrarConsulta(
      afiliado.id, req.usuario?.id || null,
      `Consulta por documento: ${req.params.numerodocumento}`
    ).catch(() => {});
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/afiliados/buscar/:numeroDocumento
 * Búsqueda interna usada por el formulario de registro cuando el asesor
 * quiere precargar los datos personales de un cliente recurrente.
 *
 * - Devuelve 200 con data=null si no hay coincidencias (en vez de 404)
 *   para que la UI muestre un toast info sin tratar como error.
 * - Retorna el afiliado MÁS RECIENTE con ese documento (orden por createdAt DESC).
 * - Registra la consulta en trazabilidad.
 */
async function buscarPorDocumento(req, res, next) {
  try {
    const { numeroDocumento } = req.params;
    const afiliado = await afiliadoService.getAfiliadoByDocumento(numeroDocumento);
    if (!afiliado) {
      return res.json({ success: true, data: null, message: 'Sin coincidencias' });
    }
    afiliadoService.registrarConsulta(
      afiliado.id, req.usuario?.id || null,
      `Búsqueda en formulario por documento: ${numeroDocumento}`
    ).catch(() => {});
    res.json({ success: true, data: afiliado });
  } catch (error) {
    next(error);
  }
}

async function actualizarBeneficiariosConsulta(req, res, next) {
  try {
    const { beneficiarios = [] } = req.body;
    const result = await afiliadoService.actualizarBeneficiariosConsulta(
      req.params.id, beneficiarios, req.usuario?.id || null
    );
    res.json({ success: true, message: 'Beneficiarios actualizados', data: result });
  } catch (error) {
    next(error);
  }
}

async function getVeoliaUnidades(req, res, next) {
  try {
    const { VeoliaUnidadNegocio } = require('../models');
    const unidades = await VeoliaUnidadNegocio.findAll({
      where: { activo: 1 },
      attributes: ['id', 'nombre'],
      order: [['nombre', 'ASC']]
    });
    res.json({ success: true, data: unidades });
  } catch (err) {
    next(err);
  }
}

async function getTrazabilidad(req, res, next) {
  try {
    const registros = await afiliadoService.getTrazabilidad(req.params.id);
    res.json({ success: true, data: registros });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /afiliados/mis-del-dia
 * Retorna las afiliaciones del asesor logueado en un rango de fechas,
 * sin filtrar por estado (pendientes, aprobadas y rechazadas).
 * Query: ?fecha=YYYY-MM-DD | ?fechaDesde&fechaHasta
 */
async function getMisDelDia(req, res, next) {
  try {
    const { fecha, fechaDesde, fechaHasta } = req.query;
    const data = await afiliadoService.getMisDelDia(req.usuario, { fecha, fechaDesde, fechaHasta });
    // Incluir hash de corrección para los rechazados, igual que getRechazados
    const enriched = data.map(a => {
      const json = a.toJSON();
      if (a.rechazado || a.rechazadoParcial) {
        json.hash = a.hashCorreccion || encodeId(a.id);
      }
      return json;
    });
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /afiliados/legalizar
 * Marca un lote de afiliaciones como legalizadas con un número de planilla.
 * Body: { afiliadoIds: number[], numeroPlanilla: string }
 * Permiso: afiliaciones.legalizar
 */
async function legalizarAfiliaciones(req, res, next) {
  try {
    const { afiliadoIds, numeroPlanilla } = req.body;
    const result = await afiliadoService.legalizarAfiliaciones(
      afiliadoIds,
      req.usuario,
      numeroPlanilla
    );
    const msg = result.legalizados > 0
      ? `${result.legalizados} afiliación(es) legalizadas con planilla N° ${numeroPlanilla}`
      : 'Todas las afiliaciones seleccionadas ya estaban legalizadas';
    res.json({ success: true, message: msg, data: result });
  } catch (err) { next(err); }
}

/**
 * POST /api/afiliados/liquidacion-pdf
 * Genera y descarga el PDF de liquidación de las afiliaciones seleccionadas.
 * Body: { afiliadoIds: number[] }
 * Permiso: afiliaciones.ver_propias (el servicio filtra por asesorId)
 */
async function liquidacionPdf(req, res, next) {
  try {
    const { afiliadoIds } = req.body || {};

    // Calcula agregados + valida ownership y estado APROBADO
    const { afiliaciones, totales } = await afiliadoService.calcularLiquidacion(
      afiliadoIds, req.usuario
    );

    // Cargar prefijo del asesor para el nombre del archivo
    const asesor = await Usuario.findByPk(req.usuario.id, {
      attributes: ['id', 'nombre', 'apellido', 'prefijo_recibo']
    });
    const prefijo = asesor?.prefijo_recibo || 'GEN';

    // Nombre con timestamp local (YYYYMMDD-HHmm)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fileName = `liquidacion-${prefijo}-${stamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await pdfService.generarLiquidacionPDF(
      afiliaciones,
      totales,
      asesor ? asesor.toJSON() : { nombre: '', apellido: '', prefijo_recibo: prefijo },
      res
    );
  } catch (err) { next(err); }
}

module.exports = {
  create,
  createPublico,
  getAll,
  getById,
  getByHash,
  getPendientes,
  aprobar,
  rechazar,
  rechazarParcial,
  getRechazados,
  reenviar,
  solicitarOtp,
  verificarOtp,
  actualizarDatosContacto,
  solicitarOtpReenvio,
  consultarPorDocumento,
  buscarPorDocumento,
  actualizarBeneficiariosConsulta,
  getTrazabilidad,
  getVeoliaUnidades,
  getMisDelDia,
  legalizarAfiliaciones,
  liquidacionPdf
};
