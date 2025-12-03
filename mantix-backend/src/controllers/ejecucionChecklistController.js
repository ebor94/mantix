// ============================================
// src/controllers/ejecucionChecklistController.js
// ============================================
const { EjecucionChecklist, MantenimientoEjecutado } = require('../models');

// Obtener checklist de un mantenimiento ejecutado
exports.obtenerPorMantenimiento = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id } = req.params;

    const checklist = await EjecucionChecklist.findAll({
      where: { mantenimiento_ejecutado_id },
      order: [['orden', 'ASC'], ['id', 'ASC']]
    });

    res.json({
      success: true,
      data: checklist
    });
  } catch (error) {
    console.error('Error al obtener checklist:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el checklist',
      error: error.message
    });
  }
};

// Obtener item de checklist por ID
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await EjecucionChecklist.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item de checklist no encontrado'
      });
    }

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Error al obtener item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el item del checklist',
      error: error.message
    });
  }
};

// Crear item de checklist
exports.crear = async (req, res) => {
  try {
    const { 
      mantenimiento_ejecutado_id, 
      actividad, 
      completada, 
      observacion, 
      orden 
    } = req.body;

    // Validaciones
    if (!mantenimiento_ejecutado_id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mantenimiento ejecutado es requerido'
      });
    }

    if (!actividad) {
      return res.status(400).json({
        success: false,
        message: 'La descripción de la actividad es requerida'
      });
    }

    // Verificar que el mantenimiento ejecutado existe
    const mantenimiento = await MantenimientoEjecutado.findByPk(mantenimiento_ejecutado_id);
    if (!mantenimiento) {
      return res.status(404).json({
        success: false,
        message: 'Mantenimiento ejecutado no encontrado'
      });
    }

    const item = await EjecucionChecklist.create({
      mantenimiento_ejecutado_id,
      actividad,
      completada: completada !== undefined ? completada : false,
      observacion,
      orden: orden || 0
    });

    res.status(201).json({
      success: true,
      message: 'Item de checklist creado exitosamente',
      data: item
    });
  } catch (error) {
    console.error('Error al crear item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el item del checklist',
      error: error.message
    });
  }
};

// Crear múltiples items de checklist
exports.crearMultiples = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id, items } = req.body;

    if (!mantenimiento_ejecutado_id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mantenimiento ejecutado es requerido'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de items'
      });
    }

    // Verificar que el mantenimiento ejecutado existe
    const mantenimiento = await MantenimientoEjecutado.findByPk(mantenimiento_ejecutado_id);
    if (!mantenimiento) {
      return res.status(404).json({
        success: false,
        message: 'Mantenimiento ejecutado no encontrado'
      });
    }

    // Agregar el mantenimiento_ejecutado_id a cada item
    const itemsConMantenimiento = items.map((item, index) => ({
      mantenimiento_ejecutado_id,
      actividad: item.actividad,
      completada: item.completada !== undefined ? item.completada : false,
      observacion: item.observacion,
      orden: item.orden !== undefined ? item.orden : index
    }));

    const itemsCreados = await EjecucionChecklist.bulkCreate(itemsConMantenimiento);

    res.status(201).json({
      success: true,
      message: `${itemsCreados.length} items de checklist creados exitosamente`,
      data: itemsCreados
    });
  } catch (error) {
    console.error('Error al crear items:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear los items del checklist',
      error: error.message
    });
  }
};

// Actualizar item de checklist
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { actividad, completada, observacion, orden } = req.body;

    const item = await EjecucionChecklist.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item de checklist no encontrado'
      });
    }

    await item.update({
      actividad: actividad || item.actividad,
      completada: completada !== undefined ? completada : item.completada,
      observacion: observacion !== undefined ? observacion : item.observacion,
      orden: orden !== undefined ? orden : item.orden
    });

    res.json({
      success: true,
      message: 'Item de checklist actualizado exitosamente',
      data: item
    });
  } catch (error) {
    console.error('Error al actualizar item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el item del checklist',
      error: error.message
    });
  }
};

// Marcar como completado/no completado
exports.toggleCompletada = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await EjecucionChecklist.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item de checklist no encontrado'
      });
    }

    await item.update({ completada: !item.completada });

    res.json({
      success: true,
      message: `Item marcado como ${item.completada ? 'completado' : 'pendiente'}`,
      data: item
    });
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar el estado del item',
      error: error.message
    });
  }
};

// Eliminar item de checklist
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const item = await EjecucionChecklist.findByPk(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item de checklist no encontrado'
      });
    }

    await item.destroy();

    res.json({
      success: true,
      message: 'Item de checklist eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar item:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el item del checklist',
      error: error.message
    });
  }
};

// Obtener estadísticas del checklist
exports.obtenerEstadisticas = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id } = req.params;

    const items = await EjecucionChecklist.findAll({
      where: { mantenimiento_ejecutado_id }
    });

    const total = items.length;
    const completadas = items.filter(item => item.completada).length;
    const pendientes = total - completadas;
    const porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

    res.json({
      success: true,
      data: {
        total,
        completadas,
        pendientes,
        porcentaje_completado: porcentaje
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las estadísticas',
      error: error.message
    });
  }
};