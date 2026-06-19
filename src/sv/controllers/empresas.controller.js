/**
 * sv/controllers/empresas.controller.js
 */
const empresas = require('../services/empresas.service');
const documentos = require('../services/documentos.service');
const propuestasArchivo = require('../services/propuestasArchivo.service');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES, AREAS, ROLES } = require('../config/constants');
const { tieneAccesoArea } = require('../utils/acceso');

// Multer: subir documentos / propuestas archivo de empresas
const UPLOAD_DIR_DOC = process.env.SV_UPLOAD_DIR
  ? path.join(process.env.SV_UPLOAD_DIR, 'empresas/documentos')
  : path.join(process.cwd(), 'uploads/sv/empresas/documentos');
const UPLOAD_DIR_PROP = process.env.SV_UPLOAD_DIR
  ? path.join(process.env.SV_UPLOAD_DIR, 'empresas/propuestas')
  : path.join(process.cwd(), 'uploads/sv/empresas/propuestas');
for (const d of [UPLOAD_DIR_DOC, UPLOAD_DIR_PROP]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
function multerFactory(destDir) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, destDir),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^\w.\-]/g, '_');
        cb(null, `${Date.now()}_${safe}`);
      }
    }),
    limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
  });
}
const uploadDocumento = multerFactory(UPLOAD_DIR_DOC);
const uploadPropuesta = multerFactory(UPLOAD_DIR_PROP);

// Middleware: requiere acceso (área principal o área extra) a PREV-EMP
function requireAreaEmp(req, res, next) {
  if (tieneAccesoArea(req.user, AREAS.PREV_EMP)) return next();
  return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Empresas solo disponibles para usuarios con acceso al área Previsión Empresariales');
}

async function list(req, res) {
  const r = await empresas.list({
    filtros: req.query, scope: req.scope, page: req.query.page, limit: req.query.limit
  });
  return ok(res, r);
}

async function buscar(req, res) {
  const empresa = await empresas.buscarPorNit(req.query.nit);
  if (!empresa) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Empresa no encontrada');
  return ok(res, empresa);
}

async function getOne(req, res) {
  const id = parseInt(req.params.id);
  const r = await empresas.obtenerConDetalle(id);
  if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Empresa no encontrada');
  // Fase 6: bandera para mostrar banner de Fidelización en la ficha
  try {
    const fideliz = require('../services/fidelizacion.service');
    r.tiene_convenio_firmado = await fideliz.empresaTieneConvenio(id);
  } catch (_e) {
    r.tiene_convenio_firmado = false;
  }
  return ok(res, r);
}

async function create(req, res) {
  try {
    const e = await empresas.crear(req.body);
    return created(res, e);
  } catch (err) {
    if (err.code === 'DUPLICATE_NIT') return fail(res, 409, ERROR_CODES.DUPLICATE_NIT, 'NIT ya registrado', { empresa: err.empresa });
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function update(req, res) {
  try {
    const e = await empresas.actualizar(parseInt(req.params.id), req.body);
    return ok(res, e);
  } catch (err) {
    if (err.code === 'DUPLICATE_NIT')   return fail(res, 409, ERROR_CODES.DUPLICATE_NIT, 'NIT ya existe', { empresa: err.empresa });
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

// ─── Reasignar asesor de la empresa (mueve todos los prospectos al nuevo asesor) ───
async function reasignarAsesor(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior pueden reasignar empresas');
  }
  try {
    const r = await empresas.reasignarAsesor(parseInt(req.params.id), parseInt(req.body.nuevo_asesor_id), {
      actorId: req.user.usr_id, motivo: req.body.motivo || ''
    });
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

// ─── Categoría manual de fidelización ───
async function actualizarCategoria(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior pueden cambiar la categoría');
  }
  try {
    const e = await empresas.actualizarCategoria(parseInt(req.params.id), req.body.categoria || null);
    return ok(res, e);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

// ─── Ajustar presupuesto de fidelización (ASIGNACION inicial o AJUSTE manual +/-) ───
async function ajustarPresupuesto(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior pueden ajustar presupuesto');
  }
  try {
    const e = await empresas.ajustarPresupuesto(parseInt(req.params.id), {
      monto: req.body.monto,
      tipo: req.body.tipo || 'AJUSTE',
      descripcion: req.body.descripcion || '',
      actorId: req.user.usr_id
    });
    return ok(res, e);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function listarMovimientos(req, res) {
  const r = await empresas.movimientosPresupuesto(parseInt(req.params.id), {
    page: req.query.page, limit: req.query.limit
  });
  return ok(res, r);
}

// ─── Reporte agregado de presupuesto fidelización por categoría ───
async function reportePresupuestoFideliz(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Reporte solo disponible para SUPERVISOR o superior');
  }
  const r = await empresas.reportePresupuestoFidelizPorCategoria();
  return ok(res, r);
}

// ─── Documentos ───
async function listarDocumentos(req, res) {
  const docs = await documentos.listarPorEmpresa(parseInt(req.params.id));
  return ok(res, docs);
}

async function subirDocumento(req, res) {
  try {
    const d = await documentos.crear(parseInt(req.params.id), {
      tipo_id: req.body.tipo_id,
      nombre: req.body.nombre,
      observaciones: req.body.observaciones
    }, req.file, req.user.usr_id);
    return created(res, d);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function eliminarDocumento(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede eliminar documentos');
  }
  try {
    const r = await documentos.eliminar(parseInt(req.params.docId));
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

// ─── Propuestas archivo ───
async function listarPropuestasArchivo(req, res) {
  const r = await propuestasArchivo.listarPorEmpresa(parseInt(req.params.id));
  return ok(res, r);
}

async function subirPropuestaArchivo(req, res) {
  try {
    const p = await propuestasArchivo.crear(parseInt(req.params.id), {
      titulo: req.body.titulo,
      descripcion: req.body.descripcion,
      tipo: req.body.tipo,
      valor: req.body.valor,
      vigencia_desde: req.body.vigencia_desde,
      vigencia_hasta: req.body.vigencia_hasta
    }, req.file, req.user.usr_id);
    return created(res, p);
  } catch (err) {
    if (err.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    if (err.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, err.message);
    throw err;
  }
}

async function eliminarPropuestaArchivo(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA, ROLES.SUPERVISOR].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo SUPERVISOR o superior puede eliminar propuestas');
  }
  try {
    const r = await propuestasArchivo.eliminar(parseInt(req.params.propId));
    return ok(res, r);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

// ─── Catálogo de tipos de documento (admin) ───
async function listarTipos(req, res) {
  const tipos = await documentos.listarTipos({ soloActivos: req.query.todos !== '1' });
  return ok(res, tipos);
}

async function crearTipo(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo ADMIN puede gestionar tipos de documento');
  }
  const t = await documentos.crearTipo(req.body);
  return created(res, t);
}

async function actualizarTipo(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo ADMIN puede gestionar tipos de documento');
  }
  try {
    const t = await documentos.actualizarTipo(parseInt(req.params.tipoId), req.body);
    return ok(res, t);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return fail(res, 404, ERROR_CODES.NOT_FOUND, err.message);
    throw err;
  }
}

async function eliminarTipo(req, res) {
  const c = req.user.rol?.rol_codigo;
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_AREA].includes(c)) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo ADMIN puede gestionar tipos de documento');
  }
  const r = await documentos.eliminarTipo(parseInt(req.params.tipoId));
  if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Tipo no encontrado');
  return ok(res, r);
}

module.exports = {
  list, buscar, getOne, create, update,
  reasignarAsesor, actualizarCategoria, ajustarPresupuesto, listarMovimientos,
  reportePresupuestoFideliz,
  listarDocumentos, subirDocumento, eliminarDocumento,
  listarPropuestasArchivo, subirPropuestaArchivo, eliminarPropuestaArchivo,
  listarTipos, crearTipo, actualizarTipo, eliminarTipo,
  requireAreaEmp, uploadDocumento, uploadPropuesta
};
