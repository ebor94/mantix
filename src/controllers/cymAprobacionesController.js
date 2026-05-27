const { CymPredio, CymContrato, Usuario } = require('../models');

const cymAprobacionesController = {
  async getAll(req, res, next) {
    try {
      const [predios, contratos] = await Promise.all([
        CymPredio.findAll({
          where: { estado_registro: 'pendiente' },
          include: [{
            model: Usuario,
            as: 'creadoPor',
            attributes: ['id', 'nombre', 'apellido']
          }],
          order: [['created_at', 'ASC']]
        }),
        CymContrato.findAll({
          where: { estado_aprobacion: 'pendiente' },
          include: [
            {
              model: CymPredio,
              as: 'predio',
              attributes: ['id', 'sector', 'numero_lote', 'acomodacion']
            },
            {
              model: Usuario,
              as: 'creadoPor',
              attributes: ['id', 'nombre', 'apellido']
            }
          ],
          order: [['created_at', 'ASC']]
        })
      ]);

      res.json({ success: true, data: { predios, contratos } });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = cymAprobacionesController;
