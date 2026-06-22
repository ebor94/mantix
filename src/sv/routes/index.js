/**
 * sv/routes/index.js
 * Agregador del módulo SerVentas → se monta en /api/sv desde src/routes/index.js
 */
const router = require('express').Router();
const { svAuth }      = require('../middleware/svAuth');
const { svAreaGuard } = require('../middleware/svAreaGuard');

router.get('/health', (_req, res) => res.json({
  ok: true,
  modulo: 'SerVentas',
  version: '0.1.0',
  ts: new Date().toISOString()
}));

router.use('/auth',     require('./auth.routes'));
router.use('/config',   svAuth, svAreaGuard, require('./config.routes'));
router.use('/usuarios', svAuth, svAreaGuard, require('./usuarios.routes'));

// ─── CRM (Fase 1) ───
router.use('/personas',   svAuth, svAreaGuard, require('./personas.routes'));
router.use('/prospectos', svAuth, svAreaGuard, require('./prospectos.routes'));
router.use('/gestiones',  svAuth, svAreaGuard, require('./gestiones.routes'));
router.use('/listas',     svAuth, svAreaGuard, require('./listas.routes'));
router.use('/reportes',   svAuth, svAreaGuard, require('./reportes.routes'));
router.use('/buscar',     svAuth, svAreaGuard, require('./buscador.routes'));

// ─── Empresariales B2B (Fase 2) ───
router.use('/empresas',   svAuth, svAreaGuard, require('./empresas.routes'));
router.use('/propuestas', svAuth, svAreaGuard, require('./propuestas.routes'));

// ─── Categorización empresas + grupos empresariales (Migración 017) ───
router.use('/',           svAuth, require('./categorizacionEmpresa.routes'));

// ─── Agenda transversal + eventos (Migración 018) ───
router.use('/',           svAuth, require('./agenda.routes'));

// ─── PAP - Puerta a Puerta (Fase 3) ───
router.use('/pap',        svAuth, svAreaGuard, require('./pap.routes'));

// ─── Fidelización Empresas (Fase 6) ───
router.use('/fidelizacion', svAuth, svAreaGuard, require('./fidelizacion.routes'));

// ─── Tracking GPS de jornadas (Fase 7) ───
router.use('/tracking',     svAuth, svAreaGuard, require('./tracking.routes'));

// ─── Renovaciones anuales B2B (Fase 8) ───
router.use('/renovaciones', svAuth, svAreaGuard, require('./renovaciones.routes'));

module.exports = router;
