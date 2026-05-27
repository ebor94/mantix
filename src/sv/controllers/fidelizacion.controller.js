/**
 * sv/controllers/fidelizacion.controller.js
 * Fase 6 — Fidelización de Empresas.
 */
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');

const fideliz = require('../services/fidelizacion.service');
const { SvProspecto, SvEstado, SvUsuario } = require('../models');
const { ok, created, noContent, fail } = require('../utils/response');
const { ERROR_CODES, ROLES, AREAS } = require('../config/constants');
const { tieneAccesoArea, grupoIdsAccesibles } = require('../utils/acceso');

// ─── multer para evidencia fotográfica ───
const UPLOAD_DIR = path.join(__dirname, '../../../uploads/sv/fideliz');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.-]/g, '_');
    cb(null, `evid_${Date.now()}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },  // 8MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se aceptan imágenes (jpg/png/webp)'));
  }
});

// ─── Helpers de permiso ───
const GRUPO_FIDELIZ = 'FIDELIZACION';

/** Asesor B2B autorizado: tiene acceso al área PREV-EMP, no es solo agente de fidelización. */
function esAsesorB2B(user) {
  return tieneAccesoArea(user, AREAS.PREV_EMP);
}

/** Agente de fidelización: pertenece al grupo FIDELIZACION (principal o extra). */
function esAgenteFideliz(user) {
  if (!user) return false;
  if (user.rol?.rol_codigo === ROLES.SUPER_ADMIN) return true;
  if (user.grupo?.grupo_codigo === GRUPO_FIDELIZ) return true;
  return (user.gruposExtra || []).some(g => g.grupo_codigo === GRUPO_FIDELIZ);
}

/** Cualquiera con acceso al área PREV-EMP puede ver fidelización (B2B + agente + supervisor + admin). */
function requireAreaEmp(req, res, next) {
  if (tieneAccesoArea(req.user, AREAS.PREV_EMP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Acceso restringido al área Previsión Empresariales');
}

/** Solo agente fideliz o supervisores (nivel ≤ 3) pueden gestionar envíos. */
function requireAgenteOSupervisor(req, res, next) {
  if (!req.user) return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'No autenticado');
  if (esAgenteFideliz(req.user)) return next();
  if (req.user.rol?.rol_nivel <= 3 && tieneAccesoArea(req.user, AREAS.PREV_EMP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo agentes de Fidelización o supervisores pueden gestionar envíos');
}

// ─── Handlers ───

async function listarContactos(req, res) {
  const empresaId = parseInt(req.params.empresaId);
  const items = await fideliz.listarContactosEmpresa(empresaId);
  return ok(res, items);
}

async function listarTodosContactos(req, res) {
  const items = await fideliz.listarTodosContactos({ q: req.query.q });
  return ok(res, items);
}

async function crearContacto(req, res) {
  try {
    const payload = { ...req.body, empresa_id: parseInt(req.params.empresaId) };
    const r = await fideliz.crearContacto(payload, req.user.usr_id);
    return created(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND')          return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR')   return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    if (err.code === 'DUPLICATE_CONTACTO') return fail(res, 409, 'DUPLICATE_CONTACTO', err.message);
    if (err.code === 'DUPLICATE_PHONE')    return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya pertenece a otra persona', { persona: err.persona, prospectos_activos: err.prospectos_activos });
    throw err;
  }
}

async function actualizarContacto(req, res) {
  try {
    const r = await fideliz.actualizarContacto(parseInt(req.params.cfId), req.body);
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

async function eliminarContacto(req, res) {
  try {
    await fideliz.eliminarContactoSoft(parseInt(req.params.cfId));
    return noContent(res);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

async function obtenerContacto(req, res) {
  const c = await fideliz.obtenerContacto(parseInt(req.params.cfId));
  if (!c) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Contacto no encontrado');
  return ok(res, c);
}

async function agregarFecha(req, res) {
  try {
    const c = await fideliz.obtenerContacto(parseInt(req.params.cfId));
    if (!c) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Contacto no encontrado');
    const r = await fideliz.agregarFecha(c.cf_persona_id, req.body);
    return created(res, r);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function eliminarFecha(req, res) {
  try {
    await fideliz.eliminarFecha(parseInt(req.params.feId));
    return noContent(res);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

async function proximosCumples(req, res) {
  const dias = parseInt(req.query.dias) || 3;
  const r = await fideliz.proximosCumpleanos({ dias });
  return ok(res, r);
}

async function calendario(req, res) {
  const r = await fideliz.calendarioMes({
    anio: parseInt(req.query.anio),
    mes:  parseInt(req.query.mes)
  });
  return ok(res, r);
}

async function registrarEnvio(req, res) {
  try {
    const r = await fideliz.registrarEnvio(req.body, req.user.usr_id);
    return created(res, r);
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    if (err.code === 'DUPLICATE_ENVIO')  return fail(res, 409, 'DUPLICATE_ENVIO', err.message);
    throw err;
  }
}

async function actualizarEnvio(req, res) {
  try {
    const r = await fideliz.actualizarEnvio(parseInt(req.params.envId), req.body);
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function listEnvios(req, res) {
  const personaId = parseInt(req.query.persona_id);
  if (!personaId) return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'persona_id requerido');
  const r = await fideliz.historialEnviosPersona(personaId);
  return ok(res, r);
}

async function historialEmpresa(req, res) {
  const empresaId = parseInt(req.params.empresaId);
  const r = await fideliz.historialEnviosEmpresa(empresaId);
  return ok(res, r);
}

async function listEmpresasConFideliz(req, res) {
  const r = await fideliz.listarEmpresasConFideliz();
  return ok(res, r);
}

async function subirEvidencia(req, res) {
  if (!req.file) return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, 'Archivo requerido (campo "foto")');
  try {
    const envId = parseInt(req.params.envId);
    const url   = `/uploads/sv/fideliz/${path.basename(req.file.path)}`;
    const r = await fideliz.actualizarEnvio(envId, { evidencia_url: url });
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

async function metricas(req, res) {
  const agenteId = req.query.agente_id ? parseInt(req.query.agente_id) : req.user.usr_id;
  const r = await fideliz.metricasFidelizacion({
    agenteId,
    desde: req.query.desde,
    hasta: req.query.hasta
  });
  return ok(res, r);
}

module.exports = {
  listarContactos, listarTodosContactos, crearContacto, actualizarContacto, eliminarContacto,
  obtenerContacto, agregarFecha, eliminarFecha,
  proximosCumples, calendario,
  registrarEnvio, actualizarEnvio, listEnvios, subirEvidencia, metricas,
  historialEmpresa, listEmpresasConFideliz,
  requireAreaEmp, requireAgenteOSupervisor,
  uploadFotoMiddleware: upload.single('foto')
};
