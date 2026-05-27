/**
 * sv/routes/fidelizacion.routes.js
 * Fase 6 — Módulo Fidelización de Empresas (dentro de PREV-EMP).
 *
 * Todas las rutas requieren acceso al área PREV-EMP. Las de envío exigen
 * además ser agente de fidelización o supervisor.
 */
const router = require('express').Router();
const ctrl   = require('../controllers/fidelizacion.controller');
const v      = require('../validations/fidelizacion.validation');
const { validate } = require('../middleware/validate');

// Todas requieren acceso al área Previsión Empresariales
router.use(ctrl.requireAreaEmp);

// ─── Empresas con fidelización ───
router.get   ('/empresas',                                                               ctrl.listEmpresasConFideliz);
router.get   ('/empresas/:empresaId/envios',                                             ctrl.historialEmpresa);

// ─── Listado global de contactos (Mis Contactos) ───
router.get   ('/contactos',                                                              ctrl.listarTodosContactos);

// ─── Contactos por empresa ───
router.get   ('/empresas/:empresaId/contactos',                                          ctrl.listarContactos);
router.post  ('/empresas/:empresaId/contactos', validate(v.crearContacto),               ctrl.crearContacto);
router.get   ('/contactos/:cfId',                                                        ctrl.obtenerContacto);
router.put   ('/contactos/:cfId',                validate(v.actualizarContacto),         ctrl.actualizarContacto);
router.delete('/contactos/:cfId',                                                        ctrl.eliminarContacto);

// ─── Fechas especiales (anexar a contacto existente) ───
router.post  ('/contactos/:cfId/fechas',         validate(v.agregarFecha),               ctrl.agregarFecha);
router.delete('/fechas/:feId',                                                           ctrl.eliminarFecha);

// ─── Calendario / próximos eventos ───
router.get   ('/proximos-cumples',               validate(v.proximos,    'query'),       ctrl.proximosCumples);
router.get   ('/calendario',                     validate(v.calendario,  'query'),       ctrl.calendario);

// ─── Envíos (solo agente fideliz o supervisor) ───
router.get   ('/envios',                         validate(v.enviosList,  'query'),       ctrl.listEnvios);
router.post  ('/envios',                         ctrl.requireAgenteOSupervisor, validate(v.registrarEnvio), ctrl.registrarEnvio);
router.patch ('/envios/:envId',                  ctrl.requireAgenteOSupervisor, validate(v.actualizarEnvio), ctrl.actualizarEnvio);
router.post  ('/envios/:envId/evidencia',
              ctrl.requireAgenteOSupervisor,
              ctrl.uploadFotoMiddleware,
              ctrl.subirEvidencia);

// ─── Métricas ───
router.get   ('/metricas',                       validate(v.metricas,    'query'),       ctrl.metricas);

module.exports = router;
