// Rutas de administración (spec §8). El router entero exige token + rol admin_masajes (router.use al inicio),
// así una ruta nueva nunca queda abierta por olvido. Las acciones sobre citas no tienen restricción de
// anticipación, pero sí motivo obligatorio para cancelar (spec §5.5–§5.6).
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereRol } = require('../middleware/autenticacion');
const { validar, Joi, inicio, id, idParam, fecha, texto, paginacion } = require('../middleware/validar');
const { ROLES } = require('../services/auth.service');
const { E } = require('../utils/MasajesError');
const aw = require('../utils/aw');
const { citaPublica } = require('./empleado.routes');

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const auditoriaDe = (req) => ({ ip: req.ip, userAgent: req.get('user-agent'), requestId: req.msjApiCodigo });
const booleano = Joi.boolean(); // en query acepta "true"/"false"; en body (convert: false) solo true/false reales

function crearRouterAdmin({ autenticar, limites, servicios }) {
  const router = express.Router();
  const { citas, disponibilidad, semanas, beneficiarios, notificaciones } = servicios;

  // Toda ruta /admin: código genérico hasta que la ruta fije el suyo, token, rol y límite de lectura.
  router.use(apiCodigo('MSJ-ADM-000'), autenticar, requiereRol(ROLES.ADMIN), limites.lectura);
  const actor = (req) => req.msjUsuario.usuario;
  const esc = limites.escritura;

  // ---- Disponibilidad y cobertura ----
  router.get('/disponibilidad', apiCodigo('MSJ-ADM-001'), validar({ query: { desde: fecha.required(), hasta: fecha.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await disponibilidad.consultar({ ...req.v.query, esAdmin: true }) });
  }));
  router.get('/cobertura', apiCodigo('MSJ-ADM-050'), validar({ query: { periodo: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/).required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.cobertura(req.v.query) });
  }));

  // ---- Semanas y bloqueos ----
  router.get('/semanas', apiCodigo('MSJ-ADM-010'), validar({ query: { desde: fecha.required(), hasta: fecha.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.listar(req.v.query) });
  }));
  router.post('/semanas', apiCodigo('MSJ-ADM-011'), esc, validar({ body: { fechaInicio: fecha.required(), capacidad: Joi.number().integer(), notas: texto(255) } }), aw(async (req, res) => {
    res.status(201).json({ success: true, data: await semanas.crear({ ...req.v.body, actor: actor(req) }) });
  }));
  router.get('/semanas/:id', apiCodigo('MSJ-ADM-012'), validar({ params: { id: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.detalle({ semanaId: req.v.params.id }) });
  }));
  router.patch('/semanas/:id', apiCodigo('MSJ-ADM-013'), esc, validar({ params: { id: idParam.required() }, body: { notas: texto(255).allow(null).required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.actualizarNotas({ semanaId: req.v.params.id, notas: req.v.body.notas, actor: actor(req) }) });
  }));
  router.post('/semanas/:id/publicar', apiCodigo('MSJ-ADM-014'), esc, validar({ params: { id: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.publicar({ semanaId: req.v.params.id, actor: actor(req) }) });
  }));
  router.post('/semanas/:id/cerrar', apiCodigo('MSJ-ADM-015'), esc, validar({ params: { id: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.cerrar({ semanaId: req.v.params.id, actor: actor(req) }) });
  }));
  router.post('/semanas/:id/bloqueos', apiCodigo('MSJ-ADM-016'), esc, validar({
    params: { id: idParam.required() },
    body: { inicio: inicio.required(), fin: inicio.required(), motivo: Joi.string().valid('festivo', 'spa', 'otro').required(), detalle: texto(255) },
  }), aw(async (req, res) => {
    res.status(201).json({ success: true, data: await semanas.agregarBloqueo({ semanaId: req.v.params.id, ...req.v.body, actor: actor(req) }) });
  }));
  router.delete('/semanas/:id/bloqueos/:bloqueoId', apiCodigo('MSJ-ADM-017'), esc, validar({ params: { id: idParam.required(), bloqueoId: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await semanas.eliminarBloqueo({ semanaId: req.v.params.id, bloqueoId: req.v.params.bloqueoId, actor: actor(req) }) });
  }));

  // ---- Beneficiarios ----
  router.get('/beneficiarios', apiCodigo('MSJ-ADM-020'), validar({ query: { q: Joi.string().max(100).allow(''), sinVincular: booleano, activo: booleano, ...paginacion } }), aw(async (req, res) => {
    res.json({ success: true, data: await beneficiarios.listar(req.v.query) });
  }));
  // La importación va ANTES de /:id para que "importar" no se lea como un id.
  router.post('/beneficiarios/importar', apiCodigo('MSJ-ADM-024'), limites.importacion,
    // Cuerpo binario (no multipart): sin parser de formularios, límite de 2 MB. Ver spec §17.7.
    express.raw({ type: [TIPO_XLSX, 'application/octet-stream'], limit: '2mb' }),
    validar({ query: { simular: booleano }, body: false }),
    aw(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw E.VALIDACION([{ campo: 'archivo', motivo: 'ARCHIVO_REQUERIDO' }]);
      const r = await beneficiarios.importar({ buffer: req.body, actor: actor(req), simular: req.v.query.simular === true });
      res.status(r.aplicado || req.v.query.simular === true ? 200 : 422).json({ success: r.errores.length === 0, data: r });
    }));
  router.get('/beneficiarios/:id', apiCodigo('MSJ-ADM-021'), validar({ params: { id: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await beneficiarios.obtener(req.v.params.id) });
  }));
  const camposBeneficiario = { nombre: Joi.string().max(200), cargo: texto(200).allow(null), celular: Joi.alternatives(Joi.string().max(30).allow(''), Joi.valid(null)), correo: texto(200).allow(null) };
  router.post('/beneficiarios', apiCodigo('MSJ-ADM-022'), esc, validar({ body: { ...camposBeneficiario, nombre: camposBeneficiario.nombre.required() } }), aw(async (req, res) => {
    res.status(201).json({ success: true, data: await beneficiarios.crear({ datos: req.v.body, actor: actor(req) }) });
  }));
  router.patch('/beneficiarios/:id', apiCodigo('MSJ-ADM-023'), esc, validar({
    params: { id: idParam.required() },
    body: { ...camposBeneficiario, adUsuario: Joi.alternatives(Joi.string().max(80), Joi.valid(null)), activo: Joi.boolean() },
  }), aw(async (req, res) => {
    res.json({ success: true, data: await beneficiarios.actualizar({ id: req.v.params.id, datos: req.v.body, actor: actor(req), auditoria: auditoriaDe(req) }) });
  }));

  // ---- Citas ----
  router.get('/citas', apiCodigo('MSJ-ADM-030'), validar({
    query: { periodo: Joi.string().pattern(/^\d{4}-(0[1-9]|1[0-2])$/), estado: Joi.string().valid('agendada', 'cancelada', 'asistio', 'no_asistio'), beneficiarioId: idParam, ...paginacion },
  }), aw(async (req, res) => {
    res.json({ success: true, data: await citas.listarAdmin(req.v.query) });
  }));
  router.post('/citas', apiCodigo('MSJ-ADM-031'), esc, validar({ body: { beneficiarioId: id.required(), inicio: inicio.required() } }), aw(async (req, res) => {
    const cita = await citas.agendar({ ...req.v.body, actor: actor(req), esAdmin: true, auditoria: auditoriaDe(req) });
    res.status(201).json({ success: true, data: citaPublica(cita) });
  }));
  router.patch('/citas/:id/reprogramar', apiCodigo('MSJ-ADM-032'), esc, validar({ params: { id: idParam.required() }, body: { inicio: inicio.required() } }), aw(async (req, res) => {
    const cita = await citas.reprogramar({ citaId: req.v.params.id, inicio: req.v.body.inicio, actor: actor(req), esAdmin: true, auditoria: auditoriaDe(req) });
    res.json({ success: true, data: citaPublica(cita) });
  }));
  router.post('/citas/:id/cancelar', apiCodigo('MSJ-ADM-033'), esc, validar({ params: { id: idParam.required() }, body: { motivo: Joi.string().max(255).required() } }), aw(async (req, res) => {
    const cita = await citas.cancelar({ citaId: req.v.params.id, motivo: req.v.body.motivo, actor: actor(req), esAdmin: true, auditoria: auditoriaDe(req) });
    res.json({ success: true, data: citaPublica(cita) });
  }));
  router.patch('/citas/:id/asistencia', apiCodigo('MSJ-ADM-034'), esc, validar({ params: { id: idParam.required() }, body: { asistio: Joi.boolean().required() } }), aw(async (req, res) => {
    const cita = await citas.marcarAsistencia({ citaId: req.v.params.id, asistio: req.v.body.asistio, actor: actor(req), auditoria: auditoriaDe(req) });
    res.json({ success: true, data: citaPublica(cita) });
  }));

  // ---- Notificaciones ----
  router.get('/notificaciones', apiCodigo('MSJ-ADM-040'), validar({ query: { estado: Joi.string().valid('pendiente', 'enviado', 'fallido', 'descartado'), ...paginacion } }), aw(async (req, res) => {
    res.json({ success: true, data: await notificaciones.listar(req.v.query) });
  }));
  router.post('/notificaciones/:id/reintentar', apiCodigo('MSJ-ADM-041'), esc, validar({ params: { id: idParam.required() } }), aw(async (req, res) => {
    res.json({ success: true, data: await notificaciones.reintentar({ id: req.v.params.id }) });
  }));

  return router;
}

module.exports = { crearRouterAdmin, TIPO_XLSX };
