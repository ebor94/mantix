// ============================================
// src/controllers/periodicidadController.js
// ============================================
const { Periodicidad, PlanActividad } = require('../models');
const { Op } = require('sequelize');

// Obtener todas las periodicidades
exports.obtenerTodas = async (req, res) => {
  try {
    const periodicidades = await Periodicidad.findAll({
      order: [['dias', 'ASC']]
    });

    res.json({
      success: true,
      data: periodicidades
    });
  } catch (error) {
    console.error('Error al obtener periodicidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las periodicidades',
      error: error.message
    });
  }
};

// Obtener periodicidad por ID
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const periodicidad = await Periodicidad.findByPk(id);

    if (!periodicidad) {
      return res.status(404).json({
        success: false,
        message: 'Periodicidad no encontrada'
      });
    }

    res.json({
      success: true,
      data: periodicidad
    });
  } catch (error) {
    console.error('Error al obtener periodicidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la periodicidad',
      error: error.message
    });
  }
};

// Crear nueva periodicidad
exports.crear = async (req, res) => {
  try {
    const { nombre, dias, descripcion } = req.body;

    // Validaciones
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es requerido'
      });
    }

    if (!dias) {
      return res.status(400).json({
        success: false,
        message: 'Los días son requeridos'
      });
    }

    if (dias < 1) {
      return res.status(400).json({
        success: false,
        message: 'Los días deben ser mayor a 0'
      });
    }

    // Verificar si ya existe una periodicidad con ese nombre
    const periodicidadExistente = await Periodicidad.findOne({ 
      where: { nombre } 
    });

    if (periodicidadExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una periodicidad con ese nombre'
      });
    }

    const periodicidad = await Periodicidad.create({
      nombre,
      dias,
      descripcion
    });

    res.status(201).json({
      success: true,
      message: 'Periodicidad creada exitosamente',
      data: periodicidad
    });
  } catch (error) {
    console.error('Error al crear periodicidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear la periodicidad',
      error: error.message
    });
  }
};

// Actualizar periodicidad
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, dias, descripcion } = req.body;

    const periodicidad = await Periodicidad.findByPk(id);

    if (!periodicidad) {
      return res.status(404).json({
        success: false,
        message: 'Periodicidad no encontrada'
      });
    }

    // Validar días si se están actualizando
    if (dias !== undefined && dias < 1) {
      return res.status(400).json({
        success: false,
        message: 'Los días deben ser mayor a 0'
      });
    }

    // Si se está actualizando el nombre, verificar que no exista otro con ese nombre
    if (nombre && nombre !== periodicidad.nombre) {
      const periodicidadExistente = await Periodicidad.findOne({ 
        where: { nombre } 
      });
      
      if (periodicidadExistente) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una periodicidad con ese nombre'
        });
      }
    }

    await periodicidad.update({
      nombre: nombre || periodicidad.nombre,
      dias: dias !== undefined ? dias : periodicidad.dias,
      descripcion: descripcion !== undefined ? descripcion : periodicidad.descripcion
    });

    res.json({
      success: true,
      message: 'Periodicidad actualizada exitosamente',
      data: periodicidad
    });
  } catch (error) {
    console.error('Error al actualizar periodicidad:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la periodicidad',
      error: error.message
    });
  }
};

// Eliminar periodicidad
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const periodicidad = await Periodicidad.findByPk(id);

    if (!periodicidad) {
      return res.status(404).json({
        success: false,
        message: 'Periodicidad no encontrada'
      });
    }

    // Verificar si tiene actividades asociadas
    const actividades = await PlanActividad.count({
      where: { periodicidad_id: id }
    });

    if (actividades > 0) {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar la periodicidad porque tiene actividades asociadas'
      });
    }

    await periodicidad.destroy();

    res.json({
      success: true,
      message: 'Periodicidad eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar periodicidad:', error);

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar la periodicidad porque está siendo utilizada en otros registros'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al eliminar la periodicidad',
      error: error.message
    });
  }
};