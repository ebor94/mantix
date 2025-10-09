// ============================================
// src/routes/index.js - Router Principal
// ============================================
const express = require('express');
const router = express.Router();

// Importar rutas
const authRoutes = require('./authRoutes');
const usuariosRoutes = require('./usuariosRoutes');
const sedesRoutes = require('./sedesRoutes');
const equiposRoutes = require('./equiposRoutes');
const mantenimientosRoutes = require('./mantenimientosRoutes');
const solicitudesRoutes = require('./solicitudesRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportesRoutes = require('./reportesRoutes');

// Montar rutas
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/sedes', sedesRoutes);
router.use('/equipos', equiposRoutes);
router.use('/mantenimientos', mantenimientosRoutes);
router.use('/solicitudes', solicitudesRoutes);
router.use('/reportes', reportesRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;