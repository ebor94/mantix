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

// Auth H360 (login con LDAP — público)
router.use('/auth', authRoutes)

// Rutas protegidas con token H360
router.use('/asistencias',           verifyToken, asistRoutes)
router.use('/usuarios',              verifyToken, usuariosRoutes)
router.use('/cofres',                verifyToken, cofresRoutes)
router.use('/sedes',                 verifyToken, sedesRoutes)
router.use('/salas',                 verifyToken, salasRoutes)
router.use('/homenajes-sala',        verifyToken, homenajesSalaRoutes)
router.use('/homenajes-residencia',  verifyToken, homenajesResidenciaRoutes)
router.use('/novedades-externas',    verifyToken, novedadesExternasRoutes)

// Health H360
router.get('/health', (_, res) => res.json({ ok: true, modulo: 'Homenajes360', version: '1.0.0' }))

module.exports = router
