// Roles controller — listado de roles para selects (solo super_admin)
const { Rol } = require('../models');

const rolesController = {
  async getAll(req, res, next) {
    try {
      if (!req.usuario?.es_super_admin) {
        return res.status(403).json({ error: 'No tienes permiso para ver los roles' });
      }
      const roles = await Rol.findAll({
        attributes: ['id', 'nombre', 'descripcion'],
        order: [['nombre', 'ASC']]
      });
      res.status(200).json(roles);
    } catch (error) {
      next(error);
    }
  }
};

module.exports = rolesController;
