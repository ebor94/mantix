// ============================================
// src/controllers/mantenimientoNovedadesController.js
// ============================================
const { 
  MantenimientoNovedad, 
  NovedadPlantilla, 
  MantenimientoProgramado, 
  Usuario, 
  Estado,
  Rol,
  PlanActividad,
  Equipo
} = require('../models');
const { Op } = require('sequelize');

const mantenimientoNovedadesController = {
  // Crear novedad
  async create(req, res, next) {
    try {
      const {
        mantenimiento_programado_id,
        tipo_novedad,
        descripcion,
        motivo,
        fecha_anterior,
        fecha_nueva,
        hora_anterior,
        hora_nueva,
        estado_anterior_id,
        estado_nuevo_id,
        prioridad_anterior,
        prioridad_nueva,
        adjuntos,
        metadata,
        es_visible_proveedor
      } = req.body;

      const usuario_registro_id = req.usuario.id;

      // Verificar que el mantenimiento existe
      const mantenimiento = await MantenimientoProgramado.findByPk(mantenimiento_programado_id);
      if (!mantenimiento) {
        return res.status(404).json({ 
          error: 'Mantenimiento programado no encontrado' 
        });
      }

      // Crear la novedad
      const novedad = await MantenimientoNovedad.create({
        mantenimiento_programado_id,
        tipo_novedad,
        descripcion,
        motivo,
        fecha_anterior,
        fecha_nueva,
        hora_anterior,
        hora_nueva,
        estado_anterior_id,
        estado_nuevo_id,
        prioridad_anterior,
        prioridad_nueva,
        usuario_registro_id,
        adjuntos: adjuntos || [],
        metadata,
        es_visible_proveedor: es_visible_proveedor || false
      });

      // Si es una reprogramación, actualizar contador en mantenimiento
      if (tipo_novedad === 'reprogramacion') {
        await mantenimiento.update({
          reprogramaciones: (mantenimiento.reprogramaciones || 0) + 1,
          ultimo_motivo_reprogramacion: motivo || descripcion,
          fecha_programada: fecha_nueva || mantenimiento.fecha_programada,
          hora_programada: hora_nueva || mantenimiento.hora_programada
        });
      }

      // Si es cambio de estado, actualizar el estado
      if (tipo_novedad === 'cambio_estado' && estado_nuevo_id) {
        await mantenimiento.update({
          estado_id: estado_nuevo_id
        });
      }

      // Si es cambio de prioridad, actualizar la prioridad
      if (tipo_novedad === 'cambio_prioridad' && prioridad_nueva) {
        await mantenimiento.update({
          prioridad: prioridad_nueva
        });
      }

      // Cargar novedad con relaciones
      const novedadCompleta = await MantenimientoNovedad.findByPk(novedad.id, {
        include: [
          { 
            model: Usuario, 
            as: 'usuario_registro', 
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          },
          { 
            model: Estado, 
            as: 'estado_anterior', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          },
          { 
            model: Estado, 
            as: 'estado_nuevo', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          }
        ]
      });

      res.status(201).json(novedadCompleta);
    } catch (error) {
      next(error);
    }
  },

  // Listar novedades de un mantenimiento
  async getByMantenimientoId(req, res, next) {
    try {
      const { mantenimientoId } = req.params;
      const { visible_proveedor, tipo_novedad, desde, hasta } = req.query;

      const whereConditions = {
        mantenimiento_programado_id: mantenimientoId
      };

      // Filtrar por visibilidad si se especifica
      if (visible_proveedor !== undefined) {
        whereConditions.es_visible_proveedor = visible_proveedor === 'true';
      }

      // Filtrar por tipo de novedad
      if (tipo_novedad) {
        whereConditions.tipo_novedad = tipo_novedad;
      }

      // Filtrar por rango de fechas
      if (desde && hasta) {
        whereConditions.created_at = { 
          [Op.between]: [desde, hasta] 
        };
      } else if (desde) {
        whereConditions.created_at = { [Op.gte]: desde };
      } else if (hasta) {
        whereConditions.created_at = { [Op.lte]: hasta };
      }

      const novedades = await MantenimientoNovedad.findAll({
        where: whereConditions,
        include: [
          { 
            model: Usuario, 
            as: 'usuario_registro', 
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          },
          { 
            model: Estado, 
            as: 'estado_anterior', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          },
          { 
            model: Estado, 
            as: 'estado_nuevo', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          }
        ],
        order: [['created_at', 'DESC']]
      });

      res.status(200).json(novedades);
    } catch (error) {
      next(error);
    }
  },

  // Obtener novedad por ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const novedad = await MantenimientoNovedad.findByPk(id, {
        include: [
          { 
            model: MantenimientoProgramado, 
            as: 'mantenimiento',
            attributes: ['id', 'codigo', 'fecha_programada', 'hora_programada', 'prioridad'],
            include: [
              {
                model: PlanActividad,
                as: 'actividad',
                attributes: ['id', 'nombre', 'descripcion'],
                include: [
                  {
                    model: Equipo,
                    as: 'equipo',
                    attributes: ['id', 'codigo', 'nombre']
                  }
                ]
              },
              {
                model: Estado,
                as: 'estado',
                attributes: ['id', 'nombre', 'color', 'tipo']
              }
            ]
          },
          { 
            model: Usuario, 
            as: 'usuario_registro', 
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          },
          { 
            model: Estado, 
            as: 'estado_anterior', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          },
          { 
            model: Estado, 
            as: 'estado_nuevo', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          }
        ]
      });

      if (!novedad) {
        return res.status(404).json({ 
          error: 'Novedad no encontrada' 
        });
      }

      res.status(200).json(novedad);
    } catch (error) {
      next(error);
    }
  },

  // Actualizar novedad
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        descripcion,
        motivo,
        fecha_nueva,
        hora_nueva,
        adjuntos,
        metadata,
        es_visible_proveedor
      } = req.body;

      const novedad = await MantenimientoNovedad.findByPk(id);
      if (!novedad) {
        return res.status(404).json({ 
          error: 'Novedad no encontrada' 
        });
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;
      if (motivo !== undefined) datosActualizacion.motivo = motivo;
      if (fecha_nueva !== undefined) datosActualizacion.fecha_nueva = fecha_nueva;
      if (hora_nueva !== undefined) datosActualizacion.hora_nueva = hora_nueva;
      if (adjuntos !== undefined) datosActualizacion.adjuntos = adjuntos;
      if (metadata !== undefined) datosActualizacion.metadata = metadata;
      if (es_visible_proveedor !== undefined) datosActualizacion.es_visible_proveedor = es_visible_proveedor;

      await novedad.update(datosActualizacion);

      const novedadActualizada = await MantenimientoNovedad.findByPk(id, {
        include: [
          { 
            model: Usuario, 
            as: 'usuario_registro', 
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          },
          { 
            model: Estado, 
            as: 'estado_anterior', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          },
          { 
            model: Estado, 
            as: 'estado_nuevo', 
            attributes: ['id', 'nombre', 'color', 'tipo'] 
          }
        ]
      });

      res.status(200).json(novedadActualizada);
    } catch (error) {
      next(error);
    }
  },

  // Eliminar novedad
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const novedad = await MantenimientoNovedad.findByPk(id);
      if (!novedad) {
        return res.status(404).json({ 
          error: 'Novedad no encontrada' 
        });
      }

      await novedad.destroy();

      res.status(200).json({ 
        message: 'Novedad eliminada exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener estadísticas de novedades
  async getEstadisticas(req, res, next) {
    try {
      const { mantenimientoId } = req.params;

      const novedades = await MantenimientoNovedad.findAll({
        where: { mantenimiento_programado_id: mantenimientoId },
        attributes: [
          'tipo_novedad',
          [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad']
        ],
        group: ['tipo_novedad'],
        raw: true
      });

      // Calcular totales
      const total = novedades.reduce((sum, item) => sum + parseInt(item.cantidad), 0);

      // Obtener última novedad
      const ultimaNovedad = await MantenimientoNovedad.findOne({
        where: { mantenimiento_programado_id: mantenimientoId },
        order: [['created_at', 'DESC']],
        include: [
          { 
            model: Usuario, 
            as: 'usuario_registro', 
            attributes: ['id', 'nombre', 'apellido'] 
          }
        ]
      });

      res.status(200).json({
        total_novedades: total,
        por_tipo: novedades,
        ultima_novedad: ultimaNovedad
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener resumen de novedades (agregado por período)
  async getResumen(req, res, next) {
    try {
      const { mantenimientoId } = req.params;
      const { periodo = 'mes' } = req.query; // dia, semana, mes, año

      let formatoFecha;
      switch (periodo) {
        case 'dia':
          formatoFecha = '%Y-%m-%d';
          break;
        case 'semana':
          formatoFecha = '%Y-%u';
          break;
        case 'año':
          formatoFecha = '%Y';
          break;
        case 'mes':
        default:
          formatoFecha = '%Y-%m';
      }

      const resumen = await MantenimientoNovedad.findAll({
        where: { mantenimiento_programado_id: mantenimientoId },
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), formatoFecha), 'periodo'],
          'tipo_novedad',
          [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad']
        ],
        group: ['periodo', 'tipo_novedad'],
        order: [[sequelize.literal('periodo'), 'DESC']],
        raw: true
      });

      res.status(200).json({
        mantenimiento_id: parseInt(mantenimientoId),
        periodo_agrupacion: periodo,
        resumen
      });
    } catch (error) {
      next(error);
    }
  },

  // PLANTILLAS
  async getPlantillas(req, res, next) {
    try {
      const { tipo_novedad } = req.query;

      const whereConditions = { es_activa: true };
      if (tipo_novedad) {
        whereConditions.tipo_novedad = tipo_novedad;
      }

      const plantillas = await NovedadPlantilla.findAll({
        where: whereConditions,
        order: [['tipo_novedad', 'ASC'], ['nombre', 'ASC']]
      });

      res.status(200).json(plantillas);
    } catch (error) {
      next(error);
    }
  },

  async getPlantillaById(req, res, next) {
    try {
      const { id } = req.params;

      const plantilla = await NovedadPlantilla.findByPk(id);
      
      if (!plantilla) {
        return res.status(404).json({ 
          error: 'Plantilla no encontrada' 
        });
      }

      res.status(200).json(plantilla);
    } catch (error) {
      next(error);
    }
  },

  async createPlantilla(req, res, next) {
    try {
      const {
        tipo_novedad,
        nombre,
        descripcion_plantilla,
        requiere_fecha,
        requiere_motivo,
        requiere_adjunto
      } = req.body;

      // Verificar si ya existe una plantilla con el mismo nombre y tipo
      const plantillaExistente = await NovedadPlantilla.findOne({
        where: { 
          nombre,
          tipo_novedad
        }
      });

      if (plantillaExistente) {
        return res.status(409).json({ 
          error: 'Ya existe una plantilla con ese nombre para este tipo de novedad' 
        });
      }

      const plantilla = await NovedadPlantilla.create({
        tipo_novedad,
        nombre,
        descripcion_plantilla,
        requiere_fecha: requiere_fecha || false,
        requiere_motivo: requiere_motivo || false,
        requiere_adjunto: requiere_adjunto || false
      });

      res.status(201).json(plantilla);
    } catch (error) {
      next(error);
    }
  },

  async updatePlantilla(req, res, next) {
    try {
      const { id } = req.params;
      const {
        nombre,
        descripcion_plantilla,
        requiere_fecha,
        requiere_motivo,
        requiere_adjunto,
        es_activa
      } = req.body;

      const plantilla = await NovedadPlantilla.findByPk(id);
      if (!plantilla) {
        return res.status(404).json({ 
          error: 'Plantilla no encontrada' 
        });
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (descripcion_plantilla !== undefined) datosActualizacion.descripcion_plantilla = descripcion_plantilla;
      if (requiere_fecha !== undefined) datosActualizacion.requiere_fecha = requiere_fecha;
      if (requiere_motivo !== undefined) datosActualizacion.requiere_motivo = requiere_motivo;
      if (requiere_adjunto !== undefined) datosActualizacion.requiere_adjunto = requiere_adjunto;
      if (es_activa !== undefined) datosActualizacion.es_activa = es_activa;

      await plantilla.update(datosActualizacion);

      res.status(200).json(plantilla);
    } catch (error) {
      next(error);
    }
  },

  async deletePlantilla(req, res, next) {
    try {
      const { id } = req.params;

      const plantilla = await NovedadPlantilla.findByPk(id);
      if (!plantilla) {
        return res.status(404).json({ 
          error: 'Plantilla no encontrada' 
        });
      }

      await plantilla.destroy();

      res.status(200).json({ 
        message: 'Plantilla eliminada exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = mantenimientoNovedadesController;