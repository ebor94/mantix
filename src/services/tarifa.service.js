const { Tarifa, PrimaSeguro } = require('../models');
const AppError = require('../utils/AppError');

async function buscarTarifa({ canal, producto, grupo, asistenciaFueraDeCasa }) {
  const tarifa = await Tarifa.findOne({
    where: {
      canal,
      producto,
      grupo,
      asistenciaFueraDeCasa: asistenciaFueraDeCasa ? 1 : 0,
      activo: 1
    }
  });
  return tarifa;
}

async function listarTarifas() {
  return Tarifa.findAll({ where: { activo: 1 }, order: [['canal', 'ASC'], ['producto', 'ASC'], ['grupo', 'ASC']] });
}

async function buscarPrimaSeguro(nombreSeguro, montoAsegurado) {
  const prima = await PrimaSeguro.findOne({
    where: { nombreSeguro, montoAsegurado, activo: 1 }
  });
  if (!prima) throw new AppError(`No hay tarifa configurada para ${nombreSeguro} por monto ${montoAsegurado}`, 404);
  return prima;
}

async function listarPrimasPorSeguro(nombreSeguro) {
  return PrimaSeguro.findAll({
    where: { nombreSeguro, activo: 1 },
    order: [['montoAsegurado', 'ASC']]
  });
}

async function listarTodasLasPrimas() {
  return PrimaSeguro.findAll({ where: { activo: 1 }, order: [['nombreSeguro', 'ASC'], ['montoAsegurado', 'ASC']] });
}

// Calcula el resumen financiero del contrato sin persistirlo
async function calcularContrato({ tarifa, numAdicionales, seguros, periodicidad }) {
  const factorPeriodicidad = {
    MENSUAL: 1,
    SEMANAL: 1 / 4.33,
    TRIMESTRAL: 3,
    SEMESTRAL: 6,
    ANUAL: 12
  };

  const factor = factorPeriodicidad[periodicidad] ?? 1;
  const valorPlanExequial = parseFloat(tarifa.valorBase) * factor;
  const valorAdicionales = parseFloat(tarifa.valorAdicional) * numAdicionales * factor;

  let valorSeguros = 0;
  for (const seg of seguros) {
    const prima = await buscarPrimaSeguro(seg.nombre, seg.monto);
    valorSeguros += parseFloat(prima.prima) * factor;
    seg.prima = parseFloat(prima.prima);
  }

  const valorTotal = valorPlanExequial + valorAdicionales + valorSeguros;

  return {
    valorPlanExequial: +valorPlanExequial.toFixed(2),
    valorAdicionales: +valorAdicionales.toFixed(2),
    valorSeguros: +valorSeguros.toFixed(2),
    valorTotal: +valorTotal.toFixed(2),
    segurosConPrima: seguros
  };
}

module.exports = { buscarTarifa, listarTarifas, buscarPrimaSeguro, listarPrimasPorSeguro, listarTodasLasPrimas, calcularContrato };
