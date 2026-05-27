const { Op } = require('sequelize');
const {
  CymPredio, CymContrato, CymMantenimiento, CymChecklist,
  CymActividad, CymEvidencia, Usuario, sequelize
} = require('../models');
const AppError = require('../utils/AppError');

const cymReporteController = {
  async timeline(req, res, next) {
    try {
      const predio = await CymPredio.findByPk(req.params.predioId, {
        include: [{
          model: CymContrato,
          as: 'contratos',
          order: [['fecha_contratacion','DESC']],
          limit: 1
        }]
      });
      if (!predio) throw new AppError('Predio no encontrado', 404);

      const mantenimientos = await CymMantenimiento.findAll({
        where: { predio_id: req.params.predioId, estado: 'completado' },
        include: [
          {
            model: CymChecklist,
            as: 'checklist',
            include: [{ model: CymActividad, as: 'actividad', attributes: ['nombre','orden'] }]
          },
          { model: CymEvidencia, as: 'evidencias' },
          { model: Usuario, as: 'supervisor', attributes: ['nombre','apellido'] }
        ],
        order: [['fecha_mant','DESC']]
      });

      res.json({ success: true, data: { predio, mantenimientos } });
    } catch (err) {
      next(err);
    }
  },

  async dashboard(req, res, next) {
    try {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);

      const [
        prediosActivos,
        prediosInactivos,
        contratosActivos,
        contratosVencidos,
        mantMes
      ] = await Promise.all([
        CymPredio.count({ where: { activo_mant: true } }),
        CymPredio.count({ where: { activo_mant: false } }),
        CymContrato.count({ where: { estado: 'activo' } }),
        CymContrato.count({ where: { estado: 'vencido' } }),
        CymMantenimiento.count({ where: { estado: 'completado', fecha_mant: { [Op.gte]: inicioMes } } })
      ]);

      // Contratos por vencer en 15 días
      const en15dias = new Date();
      en15dias.setDate(en15dias.getDate() + 15);
      const porVencer = await CymContrato.count({
        where: { estado: 'activo', fecha_vencimiento: { [Op.lte]: en15dias } }
      });

      res.json({
        success: true,
        data: {
          prediosActivos, prediosInactivos,
          contratosActivos, contratosVencidos,
          contratosProxVencer: porVencer,
          mantenimientosMes: mantMes
        }
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymReporteController;
