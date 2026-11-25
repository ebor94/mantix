/**
 * desinfecciones.routes.js — seguimiento y control de desinfecciones del parque
 * automotor.
 *
 * Módulo aparte del flujo de asistencias: acá no se registra la desinfección
 * del traslado de un caso puntual (eso es el F-08), sino el mantenimiento
 * sanitario periódico de los vehículos.
 *
 * El callback de n8n NO está en este archivo: va montado en routes/index.js,
 * antes y fuera de `verifyToken`, porque n8n no puede mandar un JWT de usuario.
 * Si algún día se trae para acá, tiene que quedar ANTES de `/evidencia/:id` o
 * el comodín se lo come.
 */
const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/desinfecciones.controller')
const aut  = require('../controllers/desinfeccionesAutorizacion.controller')
const evid = require('../services/desinfeccionEvidencia.service')

// Los valores pactados con el lavadero y el estado del parque los ve quien
// sigue la operación. El asistente de tanatólogo entra porque es quien ejecuta
// las desinfecciones con evidencia y tiene que ver qué le toca.
// El `asistente` entra porque también conduce (los conductores salen de
// LDAP_GROUP_ASIST_TANATOLOGO y LDAP_GROUP_ASISTENTE) y es quien ejecuta la
// desinfección del vehículo que tiene a cargo. Antes no veía el módulo
// siquiera: ni dashboard tiene, y caía en /mis-asistencias.
const ROLES_VER = ['asistente_tanatologo', 'asistente', 'asesor', 'supervisora', 'coordinador', 'contabilidad', 'admin']

// El catálogo, las reglas y el calendario son de coordinación: definen cada
// cuánto hay que hacer qué, y de ahí sale la inhabilitación de un vehículo.
const ROLES_CONFIG = ['coordinador', 'admin']

// Quien ejecuta la actividad o la registra por alguien más.
const ROLES_REGISTRAR = ['asistente_tanatologo', 'asistente', 'coordinador', 'admin']

// Pedir el código que levanta un vehículo inhabilitado: lo necesita quien se
// queda sin carro para un servicio.
const ROLES_AUTORIZAR = ['asesor', 'supervisora', 'coordinador', 'admin']

// El rastro de las excepciones: quién levantó qué vehículo, cuándo y por qué.
const ROLES_AUDITAR = ['coordinador', 'contabilidad', 'admin']

// Las cifras del estado de la flota las lee quien responde por el área; el
// listado de registros sigue abierto a quien opera (ROLES_VER). Es una lista
// propia y no `ROLES_CONFIG`: hoy tienen los mismos miembros, pero una
// gobierna el catálogo y la otra un informe, y mezclarlas haría que mañana
// alguien cambie una creyendo que mueve la otra.
const ROLES_FLOTA = ['coordinador', 'admin']

// ── Catálogo de actividades y la matriz de reglas ──────────────────────────
router.get  ('/actividades',     requireRol(...ROLES_VER),    ctrl.listarActividades)
router.post ('/actividades',     requireRol(...ROLES_CONFIG), ctrl.crearActividad)
router.patch('/actividades/:id', requireRol(...ROLES_CONFIG), ctrl.actualizarActividad)

router.get  ('/reglas',          requireRol(...ROLES_VER),    ctrl.listarReglas)
router.post ('/reglas',          requireRol(...ROLES_CONFIG), ctrl.crearRegla)
router.patch('/reglas/:id',      requireRol(...ROLES_CONFIG), ctrl.actualizarRegla)

// ── Tablero y calendario ──────────────────────────────────────────────────
router.get  ('/tablero',          requireRol(...ROLES_VER),    ctrl.tablero)
router.patch('/programacion/:id', requireRol(...ROLES_CONFIG), ctrl.actualizarProgramacion)

// ── Registro de ejecución ─────────────────────────────────────────────────
// La subida va antes del controlador: deja los archivos en req.files y el
// controlador decide si la actividad los exigía.
router.post('/registro',  requireRol(...ROLES_REGISTRAR), evid.subidaEvidencia, ctrl.registrar)
router.get ('/registros', requireRol(...ROLES_VER),       ctrl.listarRegistros)

// ── Informes ──────────────────────────────────────────────────────────────
// Las cifras del estado de la flota, de toda la flota y de ahora: el 403 para
// los demás roles ES la restricción del panel, y por eso el frontend no repite
// ninguna lista de roles para decidir si lo pinta.
// No hay ninguna ruta con parámetro en este router que pueda capturar
// `/informes/flota` (el único comodín es `/evidencia/:id`), pero igual queda
// declarada antes de él.
router.get('/informes/flota', requireRol(...ROLES_FLOTA), ctrl.informeFlota)

// ── Lo que alimenta el aviso de las 5 pm ──────────────────────────────────
// La ventana horaria la decide el servidor, no el navegador.
router.get('/pendientes', requireRol(...ROLES_VER), ctrl.pendientes)

// ── Evidencia fotográfica ─────────────────────────────────────────────────
// Se sirve por endpoint con token, como el PDF del R-34, y nunca como estático:
// es evidencia sanitaria.
router.get('/evidencia/:id', requireRol(...ROLES_VER), evid.servirEvidencia)

// ── Excepciones: levantar un vehículo con código de autorización ──────────
router.get ('/autorizaciones', requireRol(...ROLES_AUDITAR), aut.listarAutorizaciones)

router.post('/vehiculos/:id/sembrar',                 requireRol(...ROLES_CONFIG),    ctrl.sembrarVehiculo)
router.post('/vehiculos/:id/autorizacion/solicitar',  requireRol(...ROLES_AUTORIZAR), aut.solicitar)
router.post('/vehiculos/:id/autorizacion/validar',    requireRol(...ROLES_AUTORIZAR), aut.validar)

module.exports = router
