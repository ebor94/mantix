// ============================================
// src/controllers/estadoController.js
// ============================================
const { Estado } = require('../models');
const { Op } = require('sequelize');

// Obtener todos los estados
exports.obtenerTodos = async (req, res) => {
  try {
    const { tipo } = req.query;
    
    const where = {};
    if (tipo) {
      where.tipo = tipo;
    }

    const estados = await Estado.findAll({
      where,
      order: [['orden', 'ASC'], ['nombre', 'ASC']]
    });

    res.json({
      success: true,
      data: estados
    });
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los estados',
      error: error.message
    });
  }
};

// Obtener estado por ID
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const estado = await Estado.findByPk(id);

    if (!estado) {
      return res.status(404).json({
        success: false,
        message: 'Estado no encontrado'
      });
    }

    res.json({
      success: true,
      data: estado
    });
  } catch (error) {
    console.error('Error al obtener estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el estado',
      error: error.message
    });
  }
};

// Crear nuevo estado
exports.crear = async (req, res) => {
  try {
    const { nombre, tipo, color, orden } = req.body;

    // Validaciones
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es requerido'
      });
    }

    if (!tipo) {
      return res.status(400).json({
        success: false,
        message: 'El tipo es requerido'
      });
    }

    if (!['mantenimiento', 'solicitud'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser "mantenimiento" o "solicitud"'
      });
    }

    // Verificar si ya existe un estado con ese nombre
    const estadoExistente = await Estado.findOne({ where: { nombre } });
    if (estadoExistente) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un estado con ese nombre'
      });
    }

    const estado = await Estado.create({
      nombre,
      tipo,
      color: color || '#667eea',
      orden: orden || 0
    });

    res.status(201).json({
      success: true,
      message: 'Estado creado exitosamente',
      data: estado
    });
  } catch (error) {
    console.error('Error al crear estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el estado',
      error: error.message
    });
  }
};

// Actualizar estado
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, tipo, color, orden } = req.body;

    const estado = await Estado.findByPk(id);

    if (!estado) {
      return res.status(404).json({
        success: false,
        message: 'Estado no encontrado'
      });
    }

    // Si se está actualizando el nombre, verificar que no exista otro con ese nombre
    if (nombre && nombre !== estado.nombre) {
      const estadoExistente = await Estado.findOne({ where: { nombre } });
      if (estadoExistente) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un estado con ese nombre'
        });
      }
    }

    // Validar tipo si se está actualizando
    if (tipo && !['mantenimiento', 'solicitud'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser "mantenimiento" o "solicitud"'
      });
    }

    await estado.update({
      nombre: nombre || estado.nombre,
      tipo: tipo || estado.tipo,
      color: color || estado.color,
      orden: orden !== undefined ? orden : estado.orden
    });

    res.json({
      success: true,
      message: 'Estado actualizado exitosamente',
      data: estado
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el estado',
      error: error.message
    });
  }
};

// Eliminar estado
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const estado = await Estado.findByPk(id);

    if (!estado) {
      return res.status(404).json({
        success: false,
        message: 'Estado no encontrado'
      });
    }

    await estado.destroy();

    res.json({
      success: true,
      message: 'Estado eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar estado:', error);
    
    // Verificar si el error es por restricción de llave foránea
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar el estado porque está siendo utilizado en otros registros'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error al eliminar el estado',
      error: error.message
    });
  }
};

// Reordenar estados
exports.reordenar = async (req, res) => {
  try {
    const { estados } = req.body; // Array de { id, orden }

    if (!Array.isArray(estados) || estados.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de estados con sus órdenes'
      });
    }

    // Actualizar el orden de cada estado
    const promesas = estados.map(({ id, orden }) => 
      Estado.update({ orden }, { where: { id } })
    );

    await Promise.all(promesas);

    res.json({
      success: true,
      message: 'Estados reordenados exitosamente'
    });
  } catch (error) {
    console.error('Error al reordenar estados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al reordenar los estados',
      error: error.message
    });
  }
};