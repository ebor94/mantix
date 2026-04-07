const tarifaService = require('../services/tarifa.service');

async function listarTarifas(req, res, next) {
  try {
    const tarifas = await tarifaService.listarTarifas();
    res.json({ success: true, data: tarifas });
  } catch (error) {
    next(error);
  }
}

async function buscarTarifa(req, res, next) {
  try {
    const { canal, producto, grupo, asistenciaFueraDeCasa } = req.query;
    const tarifa = await tarifaService.buscarTarifa({
      canal,
      producto,
      grupo,
      asistenciaFueraDeCasa: asistenciaFueraDeCasa === 'SI'
    });
    if (!tarifa) {
      return res.status(404).json({ success: false, message: 'Tarifa no encontrada para esa combinación' });
    }
    res.json({ success: true, data: tarifa });
  } catch (error) {
    next(error);
  }
}

async function listarPrimas(req, res, next) {
  try {
    const { seguro } = req.query;
    const primas = seguro
      ? await tarifaService.listarPrimasPorSeguro(seguro)
      : await tarifaService.listarTodasLasPrimas();
    res.json({ success: true, data: primas });
  } catch (error) {
    next(error);
  }
}

module.exports = { listarTarifas, buscarTarifa, listarPrimas };
