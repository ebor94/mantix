const { generarResultadosXlsx } = require('../services/export.service');

const dos = (n) => String(n).padStart(2, '0');

exports.resultados = async (req, res) => {
  const ahora = new Date();
  const sello = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  const buffer = await generarResultadosXlsx();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="trikipeludos-resultados-${sello}.xlsx"`);
  res.send(buffer);
};
