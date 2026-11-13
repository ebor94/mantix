/**
 * h360/routes/index.js
 * Punto de entrada del módulo Homenajes360 dentro de mantix-backend.
 * Se monta en /api/h360 desde src/routes/index.js
 */
const router       = require('express').Router()
const { verifyToken } = require('../middleware/auth')
const authRoutes   = require('./auth.routes')
const asistRoutes  = require('./asistencias.routes')
const usuariosRoutes = require('./usuarios.routes')
const cofresRoutes              = require('./cofres.routes')
const sedesRoutes               = require('./sedes.routes')
const salasRoutes               = require('./salas.routes')
const homenajesSalaRoutes       = require('./homenajes_sala.routes')
const homenajesResidenciaRoutes = require('./homenajes_residencia.routes')
const novedadesExternasRoutes   = require('./novedades_externas.routes')
const gestionServiciosRoutes    = require('./gestion_servicios.routes')
const vehiculosRoutes           = require('./vehiculos.routes')
const exequiasRoutes            = require('./exequias.routes')
const r34Routes                 = require('./r34.routes')
const licenciasRoutes           = require('./licencias.routes')
const reportesRoutes            = require('./reportes.routes')
const dueloRoutes               = require('./duelo.routes')
const desinfeccionesRoutes      = require('./desinfecciones.routes')
const desinfeccionesCtrl        = require('../controllers/desinfecciones.controller')
const { requireWebhookToken }   = require('../middleware/webhookToken')
const evidenciaDesinf           = require('../services/desinfeccionEvidencia.service')
const exequiasCtrl              = require('../controllers/exequias.controller')

// Auth H360 (login con LDAP — público)
router.use('/auth', authRoutes)

// Endpoint PÚBLICO — pantalla de programación de exequias (validado por token)
router.get('/publico/programacion/:token', exequiasCtrl.programacionPublica)
// Televisor del garaje: qué vehículo no se puede usar y a cuál le toca algo
// pronto. Sin sesión, con token propio en la URL (DESINF_PUBLICO_TOKEN).
router.get('/publico/desinfecciones/:token', desinfeccionesCtrl.tableroPublico)

// Rutas protegidas con token H360
router.use('/asistencias',           verifyToken, asistRoutes)
router.use('/usuarios',              verifyToken, usuariosRoutes)
router.use('/cofres',                verifyToken, cofresRoutes)
router.use('/sedes',                 verifyToken, sedesRoutes)
router.use('/salas',                 verifyToken, salasRoutes)
router.use('/homenajes-sala',        verifyToken, homenajesSalaRoutes)
router.use('/homenajes-residencia',  verifyToken, homenajesResidenciaRoutes)
router.use('/novedades-externas',    verifyToken, novedadesExternasRoutes)
router.use('/gestion-servicios',     verifyToken, gestionServiciosRoutes)
router.use('/vehiculos',             verifyToken, vehiculosRoutes)
router.use('/exequias',              verifyToken, exequiasRoutes)
router.use('/r34',                   verifyToken, r34Routes)
router.use('/licencias',             verifyToken, licenciasRoutes)
router.use('/reportes',              verifyToken, reportesRoutes)
router.use('/duelo',                 verifyToken, dueloRoutes)

// Desinfecciones del parque automotor. El callback de n8n va antes del montaje
// con token y FUERA de el: n8n no puede mandar un JWT de usuario. Se autentica
// con un secreto compartido por cabecera (DESINF_DRIVE_CALLBACK_TOKEN) en vez
// de quedar abierto, que es como estan hoy los callbacks del R-44 — y la API
// esta publicada en internet, asi que «es IP interna» no es una proteccion.
// Va primero para que el comodin /evidencia/:id del router no se lo coma.
router.post('/desinfecciones/evidencia/drive',
  requireWebhookToken('DESINF_DRIVE_CALLBACK_TOKEN'), evidenciaDesinf.callbackDrive)
router.use('/desinfecciones',        verifyToken, desinfeccionesRoutes)

// Health H360
router.get('/health', (_, res) => res.json({ ok: true, modulo: 'Homenajes360', version: '1.0.0' }))

module.exports = router
