const { calcularDashboard, listarEmpresasConAfiliaciones } = require('../services/dashboardAfiliaciones.service');

/**
 * GET /api/afiliados/dashboard
 * Devuelve los indicadores agregados de afiliaciones. El alcance (global vs
 * asesor) se resuelve dentro del servicio a partir de req.usuario.
 */
async function dashboard(req, res, next) {
  try {
    const { desde, hasta, origen, convenioId, empresaId } = req.query;
    const data = await calcularDashboard({
      usuario: req.usuario, desde, hasta, origen, convenioId, empresaId
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/afiliados/dashboard/empresas
 * Lista las empresas que tienen afiliaciones, para el selector del dashboard.
 */
async function empresas(req, res, next) {
  try {
    const data = await listarEmpresasConAfiliaciones();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, empresas };
