// Main router file
const express = require('express');
const router = express.Router();

// Import all routes
const authRoutes = require('./authRoutes');
const usuariosRoutes = require('./usuariosRoutes');
const sedesRoutes = require('./sedesRoutes');
const equiposRoutes = require('./equiposRoutes');
const mantenimientosRoutes = require('./mantenimientosRoutes');
const solicitudesRoutes = require('./solicitudesRoutes');
const reportesRoutes = require('./reportesRoutes');
const dashboardRoutes = require('./dashboardRoutes');

// Register all routes
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/sedes', sedesRoutes);
router.use('/equipos', equiposRoutes);
router.use('/mantenimientos', mantenimientosRoutes);
router.use('/solicitudes', solicitudesRoutes);
router.use('/reportes', reportesRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;