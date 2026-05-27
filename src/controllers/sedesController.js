// Sedes controller
const { Sede, Usuario, Rol } = require('../models');
const { Op } = require('sequelize');

const sedesController = {
  // Get all sedes
  async getAll(req, res, next) {
    try {
      const sedes = await Sede.findAll({
        include: [{
          model: Usuario,
          as: 'responsable',
          attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
          include: [{
            model: Rol,
            as: 'rol',
            attributes: ['nombre']
          }]
        }],
        order: [['codigo', 'ASC']]
      });

      res.status(200).json(sedes);
    } catch (error) {
      next(error);
    }
  },

  // Get sede by ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sede = await Sede.findByPk(id, {
        include: [{
          model: Usuario,
          as: 'responsable',
          attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
          include: [{
            model: Rol,
            as: 'rol',
            attributes: ['nombre']
          }]
        }]
      });

      if (!sede) {
        return res.status(404).json({ 
          error: 'Sede no encontrada' 
        });
      }

      res.status(200).json(sede);
    } catch (error) {
      next(error);
    }
  },

  // Create sede
  async create(req, res, next) {
    try {
      const { codigo, nombre, direccion, ciudad, telefono, responsable_id, activo } = req.body;

      // Verificar si el código ya existe
      const codigoExistente = await Sede.findOne({ where: { codigo } });
      if (codigoExistente) {
        return res.status(409).json({ 
          error: 'El código de sede ya está registrado' 
        });
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Crear la sede
      const nuevaSede = await Sede.create({
        codigo,
        nombre,
        direccion,
        ciudad,
        telefono,
        responsable_id,
        activo: activo !== undefined ? activo : true
      });

      // Obtener la sede creada con su responsable
      const sedeCreada = await Sede.findByPk(nuevaSede.id, {
        include: [{
          model: Usuario,
          as: 'responsable',
          attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
          include: [{
            model: Rol,
            as: 'rol',
            attributes: ['nombre']
          }]
        }]
      });

      res.status(201).json(sedeCreada);
    } catch (error) {
      next(error);
    }
  },

  // Update sede
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { codigo, nombre, direccion, ciudad, telefono, responsable_id, activo } = req.body;

      // Verificar si la sede existe
      const sede = await Sede.findByPk(id);
      if (!sede) {
        return res.status(404).json({ 
          error: 'Sede no encontrada' 
        });
      }

      // Si se está actualizando el código, verificar que no esté en uso
      if (codigo && codigo !== sede.codigo) {
        const codigoExistente = await Sede.findOne({ 
          where: { 
            codigo,
            id: { [Op.ne]: id }
          } 
        });
        
        if (codigoExistente) {
          return res.status(409).json({ 
            error: 'El código de sede ya está registrado en otra sede' 
          });
        }
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (codigo !== undefined) datosActualizacion.codigo = codigo;
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (direccion !== undefined) datosActualizacion.direccion = direccion;
      if (ciudad !== undefined) datosActualizacion.ciudad = ciudad;
      if (telefono !== undefined) datosActualizacion.telefono = telefono;
      if (responsable_id !== undefined) datosActualizacion.responsable_id = responsable_id;
      if (activo !== undefined) datosActualizacion.activo = activo;

      // Actualizar sede
      await sede.update(datosActualizacion);

      // Obtener sede actualizada con su responsable
      const sedeActualizada = await Sede.findByPk(id, {
        include: [{
          model: Usuario,
          as: 'responsable',
          attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
          include: [{
            model: Rol,
            as: 'rol',
            attributes: ['nombre']
          }]
        }]
      });

      res.status(200).json(sedeActualizada);
    } catch (error) {
      next(error);
    }
  },

  // Delete sede
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // Verificar si la sede existe
      const sede = await Sede.findByPk(id);
      if (!sede) {
        return res.status(404).json({ 
          error: 'Sede no encontrada' 
        });
      }

      // Verificar si la sede tiene equipos asociados
      const equiposAsociados = await sede.countEquipos();
      if (equiposAsociados > 0) {
        return res.status(400).json({ 
          error: `No se puede eliminar la sede porque tiene ${equiposAsociados} equipo(s) asociado(s)` 
        });
      }

      // Eliminar la sede
      await sede.destroy();

      res.status(200).json({ 
        message: 'Sede eliminada exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = sedesController;