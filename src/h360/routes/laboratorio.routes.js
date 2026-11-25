/**
 * laboratorio.routes.js — seguimiento y control del aseo y la desinfección del
 * laboratorio.
 *
 * Hermano del módulo de vehículos (`desinfecciones.routes.js`), con tablas
 * propias (`h360_lab_*`) y otra naturaleza de periodicidad. Se monta en
 * `/api/h360/laboratorio` desde `routes/index.js`, detrás de `verifyToken`.
 *
 * Acá NO hay ninguna ruta pública ni ningún callback de webhook: el televisor
 * del garaje y el callback de Drive son del módulo de vehículos, así que este
 * router entero vive detrás del token y no hay excepción que mantener.
 *
 * El histórico plano (`GET /registros`) se monta sobre el controlador de
 * INFORMES, no sobre el principal: ver el comentario de la ruta.
 */
const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/laboratorio.controller')
const inf  = require('../controllers/laboratorioInformes.controller')
const evid = require('../services/desinfeccionEvidencia.service')

// El estado sanitario del laboratorio lo ve quien sigue la operación.
//
// `tanatologo` es NUEVO: no está en el módulo de vehículos y entra SOLO acá,
// porque el laboratorio es donde trabaja. Sin él, la persona que hace el aseo no
// ve ni el tablero. Al rol le hace falta su `LDAP_GROUP_TANATOLOGO` en el `.env`
// del servidor: sin esa variable el rol no resuelve y nadie entra con él, que es
// exactamente lo que pasó con `LDAP_GROUP_ASIST_TANATOLOGO` en vehículos.
//
// `asesor`, `supervisora` y `contabilidad` ven pero no ejecutan: necesitan saber
// el estado sanitario del área para responder por él.
const ROLES_VER = ['tanatologo', 'asistente_tanatologo', 'asistente', 'asesor', 'supervisora', 'coordinador', 'contabilidad', 'admin']

// Quien ejecuta el aseo o lo registra por alguien más. Omitir cierra una tarea
// igual que registrarla, así que va con esta lista y no con la de ver.
//
// Es la MISMA lista que el controlador exporta en `_internos` y que viaja en
// `puede_registrar` del tablero: se toma de ahí y no se reescribe, porque dos
// copias se desincronizan y el tablero diría `puede_registrar: true` a alguien
// que después recibe un 403 al tildar la casilla.
const ROLES_REGISTRAR = ctrl._internos.ROLES_QUE_REGISTRAN

// El catálogo y la matriz de reglas deciden cada cuánto hay que hacer qué: es de
// coordinación, igual que en el módulo de vehículos.
const ROLES_CONFIG = ['coordinador', 'admin']

// El indicador de cumplimiento del área lo lee quien responde por él. El
// personal que ejecuta ve su tablero y su historial, no el informe que lo mide.
const ROLES_INFORMES = ['coordinador', 'contabilidad', 'admin']

// ── Laboratorios (hoy uno; la tabla existe para la segunda sede) ───────────
router.get('/laboratorios', requireRol(...ROLES_VER), ctrl.listarLaboratorios)

// ── Catálogo de actividades y la matriz de reglas ──────────────────────────
router.get  ('/actividades',     requireRol(...ROLES_VER),    ctrl.listarActividades)
router.post ('/actividades',     requireRol(...ROLES_CONFIG), ctrl.crearActividad)
router.patch('/actividades/:id', requireRol(...ROLES_CONFIG), ctrl.actualizarActividad)

router.get  ('/reglas',          requireRol(...ROLES_VER),    ctrl.listarReglas)
router.post ('/reglas',          requireRol(...ROLES_CONFIG), ctrl.crearRegla)
router.patch('/reglas/:id',      requireRol(...ROLES_CONFIG), ctrl.actualizarRegla)

// ── Tablero ───────────────────────────────────────────────────────────────
// Es el segundo disparador de la generación del día: la consulta cierra las
// diarias vencidas y genera las de hoy antes de leer. Esa lógica es del
// controlador; lo que importa acá es que la ruta no quede detrás de un rol más
// estrecho que el que la usa, o el disparador deja de dispararse.
router.get('/tablero', requireRol(...ROLES_VER), ctrl.tablero)

// ── Registro de ejecución ─────────────────────────────────────────────────
// `subidaEvidencia` (el multer EN MEMORIA del módulo de vehículos, reusado) va
// ANTES del controlador y DESPUÉS de `requireRol`:
//   · antes del controlador, porque es lo que llena `req.files`. Sin él toda
//     actividad de tipo EVIDENCIA responde 400 aunque el operario haya mandado
//     la foto, y el mensaje culpa justo al que sí la mandó.
//   · después de `requireRol`, para no procesar la subida de quien no puede
//     registrar.
router.post('/registro', requireRol(...ROLES_REGISTRAR), evid.subidaEvidencia, ctrl.registrar)

// PATCH y en singular: omitir MODIFICA la tarea del día que ya existe, igual que
// `/programacion/:id` en vehículos.
router.patch('/tarea/:id/omitir', requireRol(...ROLES_REGISTRAR), ctrl.omitirTarea)

// ── Historial ─────────────────────────────────────────────────────────────
// Sobre `inf.historial` y no sobre el controlador principal: es un
// sobre-conjunto —los mismos filtros más `registrado_por`, `frecuencia`, `page`
// y `limit`— y devuelve `total`, que es lo que la exportación a Excel necesita
// para saber cuántas páginas pedir (el backend no genera archivos).
//
// Va con ROLES_VER y no con ROLES_INFORMES: es la misma lectura del tablero en
// plano, de donde sale el papel que alguien va a buscar, no el indicador que
// mide al área. Es también como está en el módulo de vehículos.
router.get('/registros', requireRol(...ROLES_VER), inf.historial)

// ── Informes ──────────────────────────────────────────────────────────────
router.get('/informes/cumplimiento', requireRol(...ROLES_INFORMES), inf.cumplimiento)
router.get('/informes/por-persona',  requireRol(...ROLES_INFORMES), inf.porPersona)

// ── Evidencia fotográfica ─────────────────────────────────────────────────
// Se sirve por endpoint con token y nunca como estático: es evidencia sanitaria.
// El handler es el del servicio de vehículos armado sobre `h360_lab_evidencia`
// —lo arma el controlador al cargarse—, así que la foto del laboratorio no se
// busca en la tabla de los vehículos.
router.get('/evidencia/:id', requireRol(...ROLES_VER), ctrl.servirEvidencia)

module.exports = router
