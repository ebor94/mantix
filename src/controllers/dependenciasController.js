// ============================================
// src/controllers/dependenciasController.js
// ============================================
const { Dependencia } = require('../models');
const { Op } = require('sequelize');

const dependenciasController = {
  // Obtener todas las dependencias
  async getAll(req, res, next) {
    try {
      const { activo } = req.query;

      const whereCondition = {};
      if (activo !== undefined) {
        whereCondition.activo = activo === 'true';
      }

      const dependencias = await Dependencia.findAll({
        where: whereCondition,
        order: [['nombre', 'ASC']]
      });

      res.status(200).json(dependencias);
    } catch (error) {
      next(error);
    }
  },

  // Obtener dependencia por ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const dependencia = await Dependencia.findByPk(id);

      if (!dependencia) {
        return res.status(404).json({ 
          error: 'Dependencia no encontrada' 
        });
      }

      res.status(200).json(dependencia);
    } catch (error) {
      next(error);
    }
  },

  // Crear dependencia
  async create(req, res, next) {
    try {
      const { nombre, descripcion, activo } = req.body;

      // Validar nombre único
      const dependenciaExistente = await Dependencia.findOne({
        where: { nombre }
      });

      if (dependenciaExistente) {
        return res.status(409).json({ 
          error: 'Ya existe una dependencia con ese nombre' 
        });
      }

      const nuevaDependencia = await Dependencia.create({
        nombre,
        descripcion,
        activo: activo !== undefined ? activo : true
      });

      res.status(201).json(nuevaDependencia);
    } catch (error) {
      next(error);
    }
  },

  // Actualizar dependencia
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, activo } = req.body;

      const dependencia = await Dependencia.findByPk(id);
      if (!dependencia) {
        return res.status(404).json({ 
          error: 'Dependencia no encontrada' 
        });
      }

      // Si se actualiza el nombre, verificar que no esté en uso
      if (nombre && nombre !== dependencia.nombre) {
        const nombreExistente = await Dependencia.findOne({
          where: { 
            nombre,
            id: { [Op.ne]: id }
          }
        });

        if (nombreExistente) {
          return res.status(409).json({ 
            error: 'El nombre ya está en uso por otra dependencia' 
          });
        }
      }

      const datosActualizacion = {};
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;
      if (activo !== undefined) datosActualizacion.activo = activo;

      await dependencia.update(datosActualizacion);

      res.status(200).json(dependencia);
    } catch (error) {
      next(error);
    }
  },

  // Eliminar dependencia
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const dependencia = await Dependencia.findByPk(id);
      if (!dependencia) {
        return res.status(404).json({ 
          error: 'Dependencia no encontrada' 
        });
      }

      // Soft delete
      await dependencia.update({ activo: false });

      res.status(200).json({ 
        message: 'Dependencia desactivada exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = dependenciasController;