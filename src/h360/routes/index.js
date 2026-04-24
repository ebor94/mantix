/**
 * h360/routes/index.js
 * Punto de entrada del módulo Homenajes360 dentro de mantix-backend.
 * Se monta en /api/h360 desde src/routes/index.js
 */
const router       = require('express').Router()
const { verifyToken } = require('../middleware/auth')
const authRoutes   = require('./auth.routes')
const asistRoutes  = require('./asistencias.routes')

// Auth H360 (login con LDAP — público)
router.use('/auth', authRoutes)

// Rutas protegidas con token H360
router.use('/asistencias', verifyToken, asistRoutes)

// Health H360
router.get('/health', (_, res) => res.json({ ok: true, modulo: 'Homenajes360', version: '1.0.0' }))

module.exports = router
