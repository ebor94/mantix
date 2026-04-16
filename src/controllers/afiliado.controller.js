const afiliadoService = require('../services/afiliado.service');
const AppError = require('../utils/AppError');
const { sendAceptacion, sendOTP } = require('../services/whatsappService');
const emailService = require('../services/emailService');
const { Afiliado } = require('../models');
const { Op } = require('sequelize');
const otpStore  = require('../utils/otpStore');
const { encodeId } = require('../utils/hashId');

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
    // Agregar hash del ID para usar en URL /corregir/:hash
    const data = afiliados.map(a => ({
      ...a.toJSON(),
      hash: encodeId(a.id)
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

    // Notificar al asesor por email con enlace de corrección (fire-and-forget)
    const destinatario = afiliado.asesor?.email || process.env.ADMIN_EMAIL || null;
    if (destinatario) {
      const hash = encodeId(afiliado.id);
      const urlBase = (process.env.FRONTEND_URL || 'https://losolivoscucuta.com').replace(/\/$/, '');
      const urlCorreccion = `${urlBase}/afiliados/corregir/${hash}`;
      const nombreAfiliado = [afiliado.primerNombre, afiliado.primerApellido].filter(Boolean).join(' ');
      emailService.sendRechazoParcialAfiliacion(destinatario, nombreAfiliado, motivo, urlCorreccion)
        .catch(() => {});
    }

    res.json({ success: true, message: 'Beneficiarios inactivados', data: afiliado });
  } catch (error) {
    next(error);
  }
}

// ── Reenvío ───────────────────────────────────────────────────────────────────

async function reenviar(req, res, next) {
  try {
    const body = { ...req.body };

    // Validar OTP antes de procesar
    const { otp } = body;
    if (!otp) throw new AppError('Se requiere el código OTP para reenviar', 400);
    if (!otpStore.verify(`reenvio:${req.params.id}`, otp)) {
      return res.status(401).json({ success: false, message: 'Código OTP inválido o expirado' });
    }

    // Eliminar otp del body antes de pasarlo al servicio
    delete body.otp;
    extractFiles(req, body);
    const result = await afiliadoService.reenviarAfiliacion(req.params.id, body, req.usuario);
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

module.exports = {
  create,
  createPublico,
  getAll,
  getById,
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
  actualizarBeneficiariosConsulta
};
