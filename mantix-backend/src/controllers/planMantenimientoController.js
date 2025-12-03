// ============================================
// src/controllers/planMantenimientoController.js - CORREGIDO
// ============================================
const db = require('../models');
const { Op } = require('sequelize');
const { paginar, formatearRespuestaPaginada } = require('../utils/helpers');
const { MENSAJES } = require('../config/constants');

const {
  PlanMantenimiento,
  PlanActividad,
  Usuario,
  Sede,
  CategoriaMantenimiento
} = db;

const planMantenimientoController = {
  /**
   * Listar planes de mantenimiento
   */
  async listar(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        activo,
        anio,
        buscar
      } = req.query;

      const where = {};

      // Filtro por activo/inactivo
      if (activo !== undefined) {
        where.activo = activo === 'true' || activo === true;
      }

      // Filtro por año
      if (anio) {
        where.anio = anio;
      }

      // Búsqueda por nombre o descripción
      if (buscar) {
        where[Op.or] = [
          { nombre: { [Op.like]: `%${buscar}%` } },
          { descripcion: { [Op.like]: `%${buscar}%` } }
        ];
      }

      const { count, rows } = await PlanMantenimiento.findAndCountAll({
        where,
        include: [
          {
            model: Usuario,
            as: 'usuario_creador', // ✅ Alias correcto
            attributes: ['id', 'nombre', 'apellido', 'email'],
            required: false
          }
        ],
        ...paginar(page, limit),
        order: [['created_at', 'DESC']],
        distinct: true
      });

      // Obtener conteo de actividades por plan
      const planesConActividades = await Promise.all(
        rows.map(async (plan) => {
          const cantidadActividades = await PlanActividad.count({
            where: { plan_id: plan.id }
          });

          return {
            ...plan.toJSON(),
            cantidad_actividades: cantidadActividades
          };
        })
      );

      res.json(formatearRespuestaPaginada(planesConActividades, page, limit, count));
    } catch (error) {
      console.error('Error en listar planes:', error);
      next(error);
    }
  },

  /**
   * Obtener plan por ID con sus actividades
   */
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;

      const plan = await PlanMantenimiento.findByPk(id, {
        include: [
          {
            model: Usuario,
            as: 'usuario_creador', // ✅ Alias correcto
            attributes: ['id', 'nombre', 'apellido', 'email'],
            required: false
          },
          {
            model: PlanActividad,
            as: 'actividades',
            required: false,
            include: [
              {
                model: Sede,
                as: 'sede',
                attributes: ['id', 'nombre'],
                required: false
              },
              {
                model: CategoriaMantenimiento,
                as: 'categoria',
                attributes: ['id', 'nombre', 'color'],
                required: false
              },
              {
                model: Usuario,
                as: 'responsable_usuario',
                attributes: ['id', 'nombre', 'apellido'],
                required: false
              }
            ]
          }
        ]
      });

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: MENSAJES.ERROR_NO_ENCONTRADO || 'Plan de mantenimiento no encontrado'
        });
      }

      res.json({
        success: true,
        data: plan
      });
    } catch (error) {
      console.error('Error en obtenerPorId:', error);
      next(error);
    }
  },


/**
 * Crear plan de mantenimiento
 */
async crear(req, res, next) {
  try {
    const {
      anio,
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      responsable_id
    } = req.body;

    // Validaciones
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del plan es requerido'
      });
    }

    if (!fecha_inicio) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de inicio es requerida'
      });
    }

    if (!fecha_fin) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de fin es requerida'
      });
    }

    // Verificar que fecha_fin sea mayor a fecha_inicio
    if (new Date(fecha_fin) < new Date(fecha_inicio)) {
      return res.status(400).json({
        success: false,
        message: 'La fecha de fin debe ser posterior a la fecha de inicio'
      });
    }

    // ✅ Extraer el año automáticamente si no se proporciona
    const anioFinal = anio || new Date(fecha_inicio).getFullYear();

    const plan = await PlanMantenimiento.create({
      anio: anioFinal, // ✅ Usar el año extraído o proporcionado
      nombre,
      descripcion,
      fecha_inicio,
      fecha_fin,
      activo: true,
      created_by: responsable_id
    });

    // Obtener plan completo con relaciones
    const planCompleto = await PlanMantenimiento.findByPk(plan.id, {
      include: [
        {
          model: Usuario,
          as: 'usuario_creador',
          attributes: ['id', 'nombre', 'apellido', 'email']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Plan de mantenimiento creado exitosamente',
      data: planCompleto
    });
  } catch (error) {
    console.error('Error en crear plan:', error);
    next(error);
  }
},

  /**
   * Actualizar plan de mantenimiento
   */
  async actualizar(req, res, next) {
    try {
      const { id } = req.params;
      const {
        anio,
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        activo
      } = req.body;

      const plan = await PlanMantenimiento.findByPk(id);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Validaciones
      if (fecha_fin && fecha_inicio && new Date(fecha_fin) < new Date(fecha_inicio)) {
        return res.status(400).json({
          success: false,
          message: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
      }

      await plan.update({
        anio,
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        activo
      });

      // Obtener plan actualizado con relaciones
      const planActualizado = await PlanMantenimiento.findByPk(id, {
        include: [
          {
            model: Usuario,
            as: 'usuario_creador', // ✅ Alias correcto
            attributes: ['id', 'nombre', 'apellido', 'email']
          }
        ]
      });

      res.json({
        success: true,
        message: 'Plan de mantenimiento actualizado exitosamente',
        data: planActualizado
      });
    } catch (error) {
      console.error('Error en actualizar plan:', error);
      next(error);
    }
  },

  /**
   * Eliminar plan de mantenimiento
   */
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;

      const plan = await PlanMantenimiento.findByPk(id);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Verificar si tiene actividades asociadas
      const cantidadActividades = await PlanActividad.count({
        where: { plan_id: id }
      });

      if (cantidadActividades > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar el plan porque tiene ${cantidadActividades} actividad(es) asociada(s). Elimine primero las actividades.`
        });
      }

      await plan.destroy();

      res.json({
        success: true,
        message: 'Plan de mantenimiento eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error en eliminar plan:', error);
      next(error);
    }
  },

  /**
   * Cambiar estado del plan (activo/inactivo)
   */
  async toggleActivo(req, res, next) {
    try {
      const { id } = req.params;

      const plan = await PlanMantenimiento.findByPk(id);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      await plan.update({ activo: !plan.activo });

      res.json({
        success: true,
        message: `Plan ${plan.activo ? 'activado' : 'desactivado'} exitosamente`,
        data: plan
      });
    } catch (error) {
      console.error('Error en toggleActivo:', error);
      next(error);
    }
  },

  /**
   * Obtener estadísticas del plan
   */
  async obtenerEstadisticas(req, res, next) {
    try {
      const { id } = req.params;

      const plan = await PlanMantenimiento.findByPk(id);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Contar actividades
      const totalActividades = await PlanActividad.count({
        where: { plan_id: id }
      });

      const actividadesActivas = await PlanActividad.count({
        where: { plan_id: id, activo: true }
      });

      // Estadísticas por tipo de mantenimiento
      const actividadesPorTipo = await PlanActividad.findAll({
        where: { plan_id: id },
        attributes: [
          'tipo_mantenimiento_id',
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cantidad']
        ],
        group: ['tipo_mantenimiento_id'],
        raw: true
      });

      // Estadísticas por sede
      const actividadesPorSede = await PlanActividad.findAll({
        where: { plan_id: id },
        attributes: [
          'sede_id',
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cantidad']
        ],
        group: ['sede_id'],
        raw: true
      });

      // Costo estimado total
      const costoTotal = await PlanActividad.sum('costo_estimado', {
        where: { plan_id: id }
      });

      res.json({
        success: true,
        data: {
          total_actividades: totalActividades,
          actividades_activas: actividadesActivas,
          actividades_inactivas: totalActividades - actividadesActivas,
          por_tipo: actividadesPorTipo,
          por_sede: actividadesPorSede,
          costo_estimado_total: costoTotal || 0
        }
      });
    } catch (error) {
      console.error('Error en obtenerEstadisticas:', error);
      next(error);
    }
  },

  /**
   * Duplicar plan de mantenimiento
   */
  async duplicar(req, res, next) {
    try {
      const { id } = req.params;
      const { nombre, anio, fecha_inicio, fecha_fin } = req.body;

      const planOriginal = await PlanMantenimiento.findByPk(id, {
        include: [
          {
            model: PlanActividad,
            as: 'actividades'
          }
        ]
      });

      if (!planOriginal) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Crear nuevo plan
      const nuevoPlan = await PlanMantenimiento.create({
        nombre: nombre || `${planOriginal.nombre} (Copia)`,
        anio: anio || planOriginal.anio,
        descripcion: planOriginal.descripcion,
        fecha_inicio: fecha_inicio || planOriginal.fecha_inicio,
        fecha_fin: fecha_fin || planOriginal.fecha_fin,
        activo: true,
        created_by: req.usuario ? req.usuario.id : planOriginal.created_by
      });

      // Duplicar actividades si existen
      if (planOriginal.actividades && planOriginal.actividades.length > 0) {
        const actividadesDuplicadas = planOriginal.actividades.map(act => ({
          plan_id: nuevoPlan.id,
          categoria_id: act.categoria_id,
          tipo_mantenimiento_id: act.tipo_mantenimiento_id,
          nombre: act.nombre,
          descripcion: act.descripcion,
          sede_id: act.sede_id,
          equipo_id: act.equipo_id,
          periodicidad_id: act.periodicidad_id,
          responsable_tipo: act.responsable_tipo,
          responsable_usuario_id: act.responsable_usuario_id,
          responsable_proveedor_id: act.responsable_proveedor_id,
          duracion_estimada_horas: act.duracion_estimada_horas,
          costo_estimado: act.costo_estimado,
          observaciones: act.observaciones,
          activo: true
        }));

        await PlanActividad.bulkCreate(actividadesDuplicadas);
      }

      // Obtener plan completo
      const planCompleto = await PlanMantenimiento.findByPk(nuevoPlan.id, {
        include: [
          {
            model: Usuario,
            as: 'usuario_creador' // ✅ Alias correcto
          },
          {
            model: PlanActividad,
            as: 'actividades'
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Plan duplicado exitosamente',
        data: planCompleto
      });
    } catch (error) {
      console.error('Error en duplicar plan:', error);
      next(error);
    }
  }
};

module.exports = planMantenimientoController;