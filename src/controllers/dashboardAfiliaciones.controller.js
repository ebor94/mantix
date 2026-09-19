const { calcularDashboard } = require('../services/dashboardAfiliaciones.service');

/**
 * GET /api/afiliados/dashboard
 * Devuelve los indicadores agregados de afiliaciones. El alcance (global vs
 * asesor) se resuelve dentro del servicio a partir de req.usuario.
 */
async function dashboard(req, res, next) {
  try {
    const { desde, hasta, origen, convenioId } = req.query;
    const data = await calcularDashboard({
      usuario: req.usuario, desde, hasta, origen, convenioId
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard };
