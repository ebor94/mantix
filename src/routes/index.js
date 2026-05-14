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
const estadoRoutes = require('./estadoRoutes');
const categoriaMantenimientoRoutes = require('./categoriaMantenimientoRoutes');
const planActividadRoutes = require('./planActividadRoutes');
const periodicidadRoutes = require('./periodicidadRoutes');
const programarMantenimientosRoutes = require('./programarMantenimientosRoutes');
const ejecucionChecklistRoutes = require('./ejecucionChecklistRoutes');
const ejecucionMaterialRoutes = require('./ejecucionMaterialRoutes');
const ejecucionEvidenciaRoutes = require('./ejecucionEvidenciaRoutes');
const planMantenimientoRoutes = require('./planMantenimientoRoutes');
const notificacionesRoutes = require('./notificacionesRoutes'); 
const proveedoresRoutes = require('./proveedoresRoutes');
const tipoMantenimientoRoutes = require('./tipoMantenimientoRoutes');
const mantenimientoNovedadesRoutes = require('./mantenimientoNovedadesRoutes'); // NUEVO
const requisitosRoutes = require('./requisitosRoutes'); // NUEVO
const dependenciasRoutes = require('./dependenciasRoutes');
const afiliadoRoutes  = require('./afiliado.routes');
const borradorRoutes  = require('./borrador.routes');
const votacionesRoutes = require('./votaciones.routes');
const empresaRoutes = require('./empresa.routes');
const tarifaRoutes = require('./tarifa.routes');
const h360Routes   = require('../h360/routes/index');   // ← Módulo Homenajes360
const r44Routes    = require('./r44Routes');              // ← Módulo R-44 Proveedores Serfunorte

// Montar rutas
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/sedes', sedesRoutes);
router.use('/equipos', equiposRoutes);
router.use('/mantenimientos', mantenimientosRoutes);
router.use('/solicitudes', solicitudesRoutes);
router.use('/reportes', reportesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/categorias-mantenimiento', categoriaMantenimientoRoutes);
router.use('/estados', estadoRoutes);
router.use('/plan-actividades', planActividadRoutes);
router.use('/periodicidades', periodicidadRoutes);
router.use('/programar-mantenimientos', programarMantenimientosRoutes);
router.use('/ejecucion-checklist', ejecucionChecklistRoutes);
router.use('/ejecucion-materiales', ejecucionMaterialRoutes);
router.use('/ejecucion-evidencias', ejecucionEvidenciaRoutes);
router.use('/planes-mantenimiento', planMantenimientoRoutes);
router.use('/notificaciones', notificacionesRoutes); 
router.use('/proveedores', proveedoresRoutes); 
router.use('/tipos-mantenimiento', tipoMantenimientoRoutes);
router.use('/mantenimiento-novedades', mantenimientoNovedadesRoutes); 
router.use('/requisitos', requisitosRoutes); // NUEVO
router.use('/dependencias', dependenciasRoutes); // ✅ NUEVO
// ⚠️ /afiliados/borradores debe montarse ANTES de /afiliados para evitar que
//    Express interprete "borradores" como un :id en la ruta /:id de afiliadoRoutes.
router.use('/afiliados/borradores', borradorRoutes);
router.use('/afiliados', afiliadoRoutes);
router.use('/votaciones', votacionesRoutes);
router.use('/empresas', empresaRoutes);
router.use('/tarifas', tarifaRoutes);
router.use('/h360',   h360Routes);   // ← Módulo Homenajes360
router.use('/cym',    require('./cym.routes')); // ← Módulo CYM Mantenimiento Predios
router.use('/r44',    r44Routes);    // ← Módulo R-44 Portal Proveedores Serfunorte

module.exports = router;