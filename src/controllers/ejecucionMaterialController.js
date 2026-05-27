// ============================================
// src/controllers/ejecucionMaterialController.js
// ============================================
const { EjecucionMaterial, MantenimientoEjecutado } = require('../models');

// Obtener materiales de un mantenimiento ejecutado
exports.obtenerPorMantenimiento = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id } = req.params;

    const materiales = await EjecucionMaterial.findAll({
      where: { mantenimiento_ejecutado_id },
      order: [['created_at', 'DESC']]
    });

    // Calcular total
    const costoTotal = materiales.reduce((sum, material) => {
      return sum + parseFloat(material.costo_total || 0);
    }, 0);

    res.json({
      success: true,
      data: materiales,
      resumen: {
        total_items: materiales.length,
        costo_total: costoTotal
      }
    });
  } catch (error) {
    console.error('Error al obtener materiales:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los materiales',
      error: error.message
    });
  }
};

// Obtener material por ID
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const material = await EjecucionMaterial.findByPk(id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material no encontrado'
      });
    }

    res.json({
      success: true,
      data: material
    });
  } catch (error) {
    console.error('Error al obtener material:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el material',
      error: error.message
    });
  }
};

// Crear material
exports.crear = async (req, res) => {
  try {
    const {
      mantenimiento_ejecutado_id,
      descripcion,
      cantidad,
      unidad,
      costo_unitario,
      observacion
    } = req.body;

    // Validaciones
    if (!mantenimiento_ejecutado_id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mantenimiento ejecutado es requerido'
      });
    }

    if (!descripcion) {
      return res.status(400).json({
        success: false,
        message: 'La descripción del material es requerida'
      });
    }

    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser mayor a 0'
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

    // El costo_total se calcula automáticamente por el hook beforeSave
    const material = await EjecucionMaterial.create({
      mantenimiento_ejecutado_id,
      descripcion,
      cantidad,
      unidad,
      costo_unitario: costo_unitario || 0,
      observacion
    });

    res.status(201).json({
      success: true,
      message: 'Material registrado exitosamente',
      data: material
    });
  } catch (error) {
    console.error('Error al crear material:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar el material',
      error: error.message
    });
  }
};

// Crear múltiples materiales
exports.crearMultiples = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id, materiales } = req.body;

    if (!mantenimiento_ejecutado_id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mantenimiento ejecutado es requerido'
      });
    }

    if (!Array.isArray(materiales) || materiales.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de materiales'
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

    // Agregar el mantenimiento_ejecutado_id a cada material
    const materialesConMantenimiento = materiales.map(material => ({
      mantenimiento_ejecutado_id,
      descripcion: material.descripcion,
      cantidad: material.cantidad,
      unidad: material.unidad,
      costo_unitario: material.costo_unitario || 0,
      observacion: material.observacion
    }));

    const materialesCreados = await EjecucionMaterial.bulkCreate(materialesConMantenimiento);

    res.status(201).json({
      success: true,
      message: `${materialesCreados.length} materiales registrados exitosamente`,
      data: materialesCreados
    });
  } catch (error) {
    console.error('Error al crear materiales:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar los materiales',
      error: error.message
    });
  }
};

// Actualizar material
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      descripcion,
      cantidad,
      unidad,
      costo_unitario,
      observacion
    } = req.body;

    const material = await EjecucionMaterial.findByPk(id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material no encontrado'
      });
    }

    // Validar cantidad si se está actualizando
    if (cantidad !== undefined && cantidad <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La cantidad debe ser mayor a 0'
      });
    }

    await material.update({
      descripcion: descripcion || material.descripcion,
      cantidad: cantidad !== undefined ? cantidad : material.cantidad,
      unidad: unidad !== undefined ? unidad : material.unidad,
      costo_unitario: costo_unitario !== undefined ? costo_unitario : material.costo_unitario,
      observacion: observacion !== undefined ? observacion : material.observacion
    });

    res.json({
      success: true,
      message: 'Material actualizado exitosamente',
      data: material
    });
  } catch (error) {
    console.error('Error al actualizar material:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el material',
      error: error.message
    });
  }
};

// Eliminar material
exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const material = await EjecucionMaterial.findByPk(id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material no encontrado'
      });
    }

    await material.destroy();

    res.json({
      success: true,
      message: 'Material eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar material:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el material',
      error: error.message
    });
  }
};

// Obtener resumen de costos
exports.obtenerResumenCostos = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id } = req.params;

    const materiales = await EjecucionMaterial.findAll({
      where: { mantenimiento_ejecutado_id }
    });

    const resumen = {
      total_items: materiales.length,
      costo_total: 0,
      materiales_por_tipo: {}
    };

    materiales.forEach(material => {
      resumen.costo_total += parseFloat(material.costo_total || 0);
      
      // Agrupar por descripción
      if (!resumen.materiales_por_tipo[material.descripcion]) {
        resumen.materiales_por_tipo[material.descripcion] = {
          cantidad_total: 0,
          costo_total: 0
        };
      }
      
      resumen.materiales_por_tipo[material.descripcion].cantidad_total += parseFloat(material.cantidad);
      resumen.materiales_por_tipo[material.descripcion].costo_total += parseFloat(material.costo_total || 0);
    });

    res.json({
      success: true,
      data: resumen
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el resumen de costos',
      error: error.message
    });
  }
};