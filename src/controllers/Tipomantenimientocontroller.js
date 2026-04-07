// ============================================
// src/controllers/tipoMantenimientoController.js
// ============================================
const db = require('../models');
const { Op } = require('sequelize');
const { paginar, formatearRespuestaPaginada } = require('../utils/helpers');
const { MENSAJES } = require('../config/constants');

const { TipoMantenimiento } = db;

const tipoMantenimientoController = {
  /**
   * Listar todos los tipos de mantenimiento
   */
  async listar(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        buscar,
        all // Parámetro para obtener todos sin paginación
      } = req.query;

      const where = {};

      // Búsqueda por nombre o descripción
      if (buscar) {
        where[Op.or] = [
          { nombre: { [Op.like]: `%${buscar}%` } },
          { descripcion: { [Op.like]: `%${buscar}%` } }
        ];
      }

      // Si se pide todo sin paginación (útil para selects)
      if (all === 'true') {
        const tipos = await TipoMantenimiento.findAll({
          where,
          order: [['nombre', 'ASC']]
        });

        return res.json({
          success: true,
          data: tipos
        });
      }

      // Con paginación
      const { count, rows } = await TipoMantenimiento.findAndCountAll({
        where,
        ...paginar(page, limit),
        order: [['nombre', 'ASC']]
      });

      res.json(formatearRespuestaPaginada(rows, page, limit, count));
    } catch (error) {
      console.error('Error en listar tipos de mantenimiento:', error);
      next(error);
    }
  },

  /**
   * Obtener tipo de mantenimiento por ID
   */
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;

      const tipo = await TipoMantenimiento.findByPk(id);

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de mantenimiento no encontrado'
        });
      }

      res.json({
        success: true,
        data: tipo
      });
    } catch (error) {
      console.error('Error en obtenerPorId:', error);
      next(error);
    }
  },

  /**
   * Crear tipo de mantenimiento
   */
  async crear(req, res, next) {
    try {
      const { nombre, descripcion } = req.body;

      // Validaciones
      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre es requerido'
        });
      }

      // Verificar si ya existe un tipo con ese nombre
      const tipoExistente = await TipoMantenimiento.findOne({
        where: { nombre }
      });

      if (tipoExistente) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un tipo de mantenimiento con ese nombre'
        });
      }

      const tipo = await TipoMantenimiento.create({
        nombre,
        descripcion
      });

      res.status(201).json({
        success: true,
        message: 'Tipo de mantenimiento creado exitosamente',
        data: tipo
      });
    } catch (error) {
      console.error('Error en crear tipo de mantenimiento:', error);
      
      // Error de validación de Sequelize
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: error.errors[0].message
        });
      }

      // Error de unique constraint
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un tipo de mantenimiento con ese nombre'
        });
      }

      next(error);
    }
  },

  /**
   * Actualizar tipo de mantenimiento
   */
  async actualizar(req, res, next) {
    try {
      const { id } = req.params;
      const { nombre, descripcion } = req.body;

      const tipo = await TipoMantenimiento.findByPk(id);

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de mantenimiento no encontrado'
        });
      }

      // Validaciones
      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre es requerido'
        });
      }

      // Verificar si ya existe otro tipo con ese nombre
      if (nombre !== tipo.nombre) {
        const tipoExistente = await TipoMantenimiento.findOne({
          where: {
            nombre,
            id: { [Op.ne]: id }
          }
        });

        if (tipoExistente) {
          return res.status(400).json({
            success: false,
            message: 'Ya existe otro tipo de mantenimiento con ese nombre'
          });
        }
      }

      await tipo.update({
        nombre,
        descripcion
      });

      res.json({
        success: true,
        message: 'Tipo de mantenimiento actualizado exitosamente',
        data: tipo
      });
    } catch (error) {
      console.error('Error en actualizar tipo de mantenimiento:', error);

      // Error de validación de Sequelize
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          message: error.errors[0].message
        });
      }

      // Error de unique constraint
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un tipo de mantenimiento con ese nombre'
        });
      }

      next(error);
    }
  },

  /**
   * Eliminar tipo de mantenimiento
   */
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;

      const tipo = await TipoMantenimiento.findByPk(id);

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de mantenimiento no encontrado'
        });
      }

      // Verificar si tiene actividades asociadas
      if (db.PlanActividad) {
        const cantidadActividades = await db.PlanActividad.count({
          where: { tipo_mantenimiento_id: id }
        });

        if (cantidadActividades > 0) {
          return res.status(400).json({
            success: false,
            message: `No se puede eliminar el tipo de mantenimiento porque tiene ${cantidadActividades} actividad(es) asociada(s)`
          });
        }
      }

      await tipo.destroy();

      res.json({
        success: true,
        message: 'Tipo de mantenimiento eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error en eliminar tipo de mantenimiento:', error);

      // Error de foreign key constraint
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar el tipo de mantenimiento porque tiene registros asociados'
        });
      }

      next(error);
    }
  },

  /**
   * Obtener estadísticas de uso
   */
  async obtenerEstadisticas(req, res, next) {
    try {
      const { id } = req.params;

      const tipo = await TipoMantenimiento.findByPk(id);

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de mantenimiento no encontrado'
        });
      }

      let cantidadActividades = 0;

      if (db.PlanActividad) {
        cantidadActividades = await db.PlanActividad.count({
          where: { tipo_mantenimiento_id: id }
        });
      }

      res.json({
        success: true,
        data: {
          tipo: tipo,
          cantidad_actividades: cantidadActividades
        }
      });
    } catch (error) {
      console.error('Error en obtenerEstadisticas:', error);
      next(error);
    }
  }
};

module.exports = tipoMantenimientoController;