// ============================================
// src/controllers/ejecucionEvidenciaController.js
// ============================================
const { EjecucionEvidencia, MantenimientoEjecutado, Usuario } = require('../models');
const fs = require('fs').promises;
const path = require('path');

// Obtener evidencias de un mantenimiento ejecutado
exports.obtenerPorMantenimiento = async (req, res) => {
  try {
    const { mantenimiento_ejecutado_id } = req.params;
    const { tipo } = req.query; // Filtrar por tipo: antes, durante, despues

    const where = { mantenimiento_ejecutado_id };
    if (tipo) where.tipo = tipo;

    const evidencias = await EjecucionEvidencia.findAll({
      where,
      include: [
        {
          model: Usuario,
          as: 'usuario_subio',
          attributes: ['id', 'nombre', 'apellido', 'email'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Agrupar por tipo
    const agrupadas = {
      antes: evidencias.filter(e => e.tipo === 'antes'),
      durante: evidencias.filter(e => e.tipo === 'durante'),
      despues: evidencias.filter(e => e.tipo === 'despues')
    };

    res.json({
      success: true,
      data: evidencias,
      agrupadas: agrupadas,
      resumen: {
        total: evidencias.length,
        antes: agrupadas.antes.length,
        durante: agrupadas.durante.length,
        despues: agrupadas.despues.length
      }
    });
  } catch (error) {
    console.error('Error al obtener evidencias:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las evidencias',
      error: error.message
    });
  }
};

// Obtener evidencia por ID
exports.obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const evidencia = await EjecucionEvidencia.findByPk(id, {
      include: [
        {
          model: Usuario,
          as: 'usuario_subio',
          attributes: ['id', 'nombre', 'apellido', 'email'],
          required: false
        }
      ]
    });

    if (!evidencia) {
      return res.status(404).json({
        success: false,
        message: 'Evidencia no encontrada'
      });
    }

    res.json({
      success: true,
      data: evidencia
    });
  } catch (error) {
    console.error('Error al obtener evidencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la evidencia',
      error: error.message
    });
  }
};

// Subir evidencia (con archivo)
exports.crear = async (req, res) => {
  try {
    const {
      mantenimiento_ejecutado_id,
      tipo,
      descripcion
    } = req.body;

    // Validaciones
    if (!mantenimiento_ejecutado_id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del mantenimiento ejecutado es requerido'
      });
    }

    if (!tipo || !['antes', 'durante', 'despues'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser: antes, durante o despues'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'El archivo es requerido'
      });
    }

    // Verificar que el mantenimiento ejecutado existe
    const mantenimiento = await MantenimientoEjecutado.findByPk(mantenimiento_ejecutado_id);
    if (!mantenimiento) {
      // Si falla, eliminar el archivo subido
      if (req.file) {
        try {
          const fs = require('fs').promises;
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error al eliminar archivo:', unlinkError);
        }
      }
      
      return res.status(404).json({
        success: false,
        message: 'Mantenimiento ejecutado no encontrado'
      });
    }

    // Información del archivo
    const tamanioKb = Math.round(req.file.size / 1024);
     const rutaRelativa = `/uploads/evidencias/${req.file.filename}`;

    // ✅ Crear evidencia (uploaded_by puede ser null si no hay usuario)
    const evidencia = await EjecucionEvidencia.create({
      mantenimiento_ejecutado_id,
      tipo,
      descripcion: descripcion || '',
      nombre_archivo: req.file.originalname,
      ruta_archivo: rutaRelativa, // ✅ Solo la ruta relativa
      tamanio_kb: tamanioKb,
      uploaded_by: req.usuario ? req.usuario.id : null
    });

    console.log('✅ Evidencia creada:', evidencia.id);

    res.status(201).json({
      success: true,
      message: 'Evidencia subida exitosamente',
      data: evidencia
    });
  } catch (error) {
    console.error('❌ Error al crear evidencia:', error);
    
    // Si hay error, eliminar el archivo subido
    if (req.file) {
      try {
        const fs = require('fs').promises;
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error al eliminar archivo:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error al subir la evidencia',
      error: error.message
    });
  }
};

// Actualizar evidencia (solo metadata, no archivo)
exports.actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, descripcion } = req.body;

    const evidencia = await EjecucionEvidencia.findByPk(id);

    if (!evidencia) {
      return res.status(404).json({
        success: false,
        message: 'Evidencia no encontrada'
      });
    }

    // Validar tipo si se está actualizando
    if (tipo && !['antes', 'durante', 'despues'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'El tipo debe ser: antes, durante o despues'
      });
    }

    await evidencia.update({
      tipo: tipo || evidencia.tipo,
      descripcion: descripcion !== undefined ? descripcion : evidencia.descripcion
    });

    res.json({
      success: true,
      message: 'Evidencia actualizada exitosamente',
      data: evidencia
    });
  } catch (error) {
    console.error('Error al actualizar evidencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la evidencia',
      error: error.message
    });
  }
};

exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    const evidencia = await EjecucionEvidencia.findByPk(id);

    if (!evidencia) {
      return res.status(404).json({
        success: false,
        message: 'Evidencia no encontrada'
      });
    }

    const fs = require('fs').promises;
    const path = require('path');
    
    // ✅ Construir ruta correcta subiendo niveles
    let rutaCompleta;
    if (evidencia.ruta_archivo.startsWith('/uploads/')) {
      // Si está en /src/controllers, subir dos niveles
      rutaCompleta = path.join(__dirname, '../../', evidencia.ruta_archivo);
    } else {
      rutaCompleta = evidencia.ruta_archivo;
    }
    
    console.log('🗑️ Intentando eliminar:', rutaCompleta);
    
    try {
      await fs.unlink(rutaCompleta);
      console.log('✅ Archivo eliminado');
    } catch (fileError) {
      console.error('⚠️ Error al eliminar archivo físico:', fileError.message);
    }

    await evidencia.destroy();

    res.json({
      success: true,
      message: 'Evidencia eliminada exitosamente'
    });
  } catch (error) {
    console.error('❌ Error al eliminar evidencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar la evidencia',
      error: error.message
    });
  }
};

// Descargar archivo de evidencia
exports.descargar = async (req, res) => {
  try {
    const { id } = req.params;

    const evidencia = await EjecucionEvidencia.findByPk(id);

    if (!evidencia) {
      return res.status(404).json({
        success: false,
        message: 'Evidencia no encontrada'
      });
    }

    // Verificar que el archivo existe
    try {
      await fs.access(evidencia.ruta_archivo);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Archivo no encontrado en el servidor'
      });
    }

    res.download(evidencia.ruta_archivo, evidencia.nombre_archivo);
  } catch (error) {
    console.error('Error al descargar evidencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al descargar la evidencia',
      error: error.message
    });
  }
};