const { Op } = require('sequelize');
const { CymCartera, CymContrato, CymPredio, CymAsignacion, Usuario } = require('../models');
const AppError = require('../utils/AppError');

const cymCarteraController = {
  // Contratos activos o vencidos asignados al auxiliar de cartera
  async getContratos(req, res, next) {
    try {
      const auxId = req.usuario.id;
      const esSuperAdmin = req.usuario.es_super_admin;

      let whereAsig = {};
      if (!esSuperAdmin) whereAsig = { aux_cartera_id: auxId };

      const asignaciones = await CymAsignacion.findAll({
        where: { ...whereAsig, activo: true },
        include: [{
          model: CymPredio,
          as: 'predio',
          include: [{
            model: CymContrato,
            as: 'contratos',
            where: { estado: { [Op.in]: ['activo','vencido'] } },
            required: true,
            order: [['fecha_contratacion','DESC']],
            limit: 1
          }]
        }]
      });

      res.json({ success: true, data: asignaciones });
    } catch (err) {
      next(err);
    }
  },

  async registrarGestion(req, res, next) {
    try {
      const { contrato_id, tipo_gestion, resultado, observacion } = req.body;

      const contrato = await CymContrato.findByPk(contrato_id);
      if (!contrato) throw new AppError('Contrato no encontrado', 404);
      if (contrato.estado === 'cerrado') throw new AppError('No se puede gestionar un contrato cerrado', 400);

      const gestion = await CymCartera.create({
        contrato_id,
        usuario_id: req.usuario.id,
        tipo_gestion,
        resultado,
        observacion
      });

      res.status(201).json({ success: true, data: gestion, message: 'Gestión registrada correctamente' });
    } catch (err) {
      next(err);
    }
  },

  async getHistorial(req, res, next) {
    try {
      const gestiones = await CymCartera.findAll({
        where: { contrato_id: req.params.contratoId },
        include: [{ model: Usuario, as: 'usuario', attributes: ['nombre','apellido'] }],
        order: [['fecha_gestion','DESC']]
      });
      res.json({ success: true, data: gestiones });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymCarteraController;
