const afiliadoService = require('../services/afiliado.service');
const AppError = require('../utils/AppError');
const { sendAceptacion } = require('../services/whatsappService');

function extractFiles(req, body) {
  if (req.files?.soporte?.[0])             body.soportePago          = req.files.soporte[0].filename;
  if (req.files?.cedulaFrontal?.[0])       body.cedulaFrontal        = req.files.cedulaFrontal[0].filename;
  if (req.files?.cedulaReverso?.[0])       body.cedulaReverso        = req.files.cedulaReverso[0].filename;
  if (req.files?.contratoCompetencia?.[0]) body.contratoCompetencia  = req.files.contratoCompetencia[0].filename;

  // Inyectar documentoUrl en cada beneficiario según el índice
  // El frontend envía los archivos como: beneficiario_doc_0, beneficiario_doc_1, …
  if (Array.isArray(body.beneficiarios)) {
    body.beneficiarios = body.beneficiarios.map((b, i) => {
      const campo = `beneficiario_doc_${i}`;
      const file  = req.files?.[campo]?.[0];
      return file ? { ...b, documentoUrl: file.filename } : b;
    });
  }
}

async function create(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    // Registrar quién creó la afiliación
    body.asesorId = req.usuario.id;
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    // Fire-and-forget: enviar WhatsApp de aceptación de datos (no bloquea si falla)
    sendAceptacion(body.celular).catch(() => {});
    res.status(201).json({
      success: true,
      message: 'Afiliado registrado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

// Registro público sin autenticación (formulario Veolia)
async function createPublico(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    // Sin sesión: asesorId queda null (campo permite null en el modelo)
    body.asesorId = null;
    // Veolia: notificación de recibo pendiente hasta aprobación
    body.notificacionRecibo = 0;
    const result = await afiliadoService.createAfiliadoWithBeneficiarios(body);
    // Fire-and-forget: enviar WhatsApp de aceptación de datos (no bloquea si falla)
    sendAceptacion(body.celular).catch(() => {});
    res.status(201).json({
      success: true,
      message: 'Afiliado registrado exitosamente',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function getAll(req, res, next) {
  try {
    const afiliados = await afiliadoService.getAllAfiliados();
    res.json({
      success: true,
      data: afiliados
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    const afiliado = await afiliadoService.getAfiliadoById(req.params.id);
    if (!afiliado) {
      throw new AppError('Afiliado no encontrado', 404);
    }
    // Si no es super admin ni aprobador, solo puede ver sus propias afiliaciones
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
    res.json({
      success: true,
      data: afiliado
    });
  } catch (error) {
    next(error);
  }
}

async function getPendientes(req, res, next) {
  try {
    // Se pasa el usuario para que el servicio filtre según sus permisos
    const afiliados = await afiliadoService.getPendientes(req.usuario);
    res.json({
      success: true,
      data: afiliados
    });
  } catch (error) {
    next(error);
  }
}

async function aprobar(req, res, next) {
  try {
    const afiliado = await afiliadoService.aprobarAfiliado(req.params.id);
    res.json({
      success: true,
      message: 'Registro aprobado exitosamente',
      data: afiliado
    });
  } catch (error) {
    next(error);
  }
}

async function rechazar(req, res, next) {
  try {
    const { motivo } = req.body;
    const afiliado = await afiliadoService.rechazarAfiliado(req.params.id, motivo);
    res.json({
      success: true,
      message: 'Registro rechazado',
      data: afiliado
    });
  } catch (error) {
    next(error);
  }
}

async function getRechazados(req, res, next) {
  try {
    // Se pasa el usuario para que el servicio filtre según sus permisos
    const afiliados = await afiliadoService.getRechazados(req.usuario);
    res.json({ success: true, data: afiliados });
  } catch (error) {
    next(error);
  }
}

async function reenviar(req, res, next) {
  try {
    const body = { ...req.body };
    extractFiles(req, body);
    // Pasar el usuario para validar que sea el dueño de la afiliación
    const result = await afiliadoService.reenviarAfiliacion(req.params.id, body, req.usuario);
    res.json({
      success: true,
      message: 'Afiliación reenviada para aprobación',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { create, createPublico, getAll, getById, getPendientes, aprobar, rechazar, getRechazados, reenviar };
