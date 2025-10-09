// ============================================
// src/controllers/mantenimientosController.js
// ============================================
const { 
  MantenimientoProgramado, 
  MantenimientoEjecutado,
  PlanActividad,
  Estado,
  Sede,
  Equipo,
  Usuario,
  Proveedor,
  CategoriaMantenimiento,
  EjecucionChecklist,
  EjecucionMaterial,
  EjecucionEvidencia
} = require('../models');
const { Op } = require('sequelize');
const { paginar, formatearRespuestaPaginada, calcularPorcentaje } = require('../utils/helpers');
const { MENSAJES, ESTADOS_MANTENIMIENTO } = require('../config/constants');

const mantenimientosController = {
  // Listar mantenimientos programados
  async listar(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        sede_id, 
        estado_id, 
        fecha_desde, 
        fecha_hasta,
        categoria_id,
        prioridad 
      } = req.query;

      const where = {};
      
      if (fecha_desde && fecha_hasta) {
        where.fecha_programada = {
          [Op.between]: [fecha_desde, fecha_hasta]
        };
      }
      
      if (estado_id) where.estado_id = estado_id;
      if (prioridad) where.prioridad = prioridad;

      const { count, rows } = await MantenimientoProgramado.findAndCountAll({
        where,
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { 
                model: Sede, 
                as: 'sede',
                where: sede_id ? { id: sede_id } : undefined
              },
              { 
                model: CategoriaMantenimiento, 
                as: 'categoria',
                where: categoria_id ? { id: categoria_id } : undefined
              },
              { model: Equipo, as: 'equipo' },
              { model: Usuario, as: 'responsable_usuario' },
              { model: Proveedor, as: 'responsable_proveedor' }
            ]
          },
          { model: Estado, as: 'estado' },
          { model: MantenimientoEjecutado, as: 'ejecucion' }
        ],
        ...paginar(page, limit),
        order: [['fecha_programada', 'ASC']]
      });

      res.json(formatearRespuestaPaginada(rows, page, limit, count));
    } catch (error) {
      next(error);
    }
  },

  // Obtener mantenimiento por ID
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;

      const mantenimiento = await MantenimientoProgramado.findByPk(id, {
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { model: Sede, as: 'sede' },
              { model: CategoriaMantenimiento, as: 'categoria' },
              { model: Equipo, as: 'equipo' },
              { model: Usuario, as: 'responsable_usuario' },
              { model: Proveedor, as: 'responsable_proveedor' }
            ]
          },
          { model: Estado, as: 'estado' },
          {
            model: MantenimientoEjecutado,
            as: 'ejecucion',
            include: [
              { model: EjecucionChecklist, as: 'checklist' },
              { model: EjecucionMaterial, as: 'materiales' },
              { model: EjecucionEvidencia, as: 'evidencias' }
            ]
          }
        ]
      });

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: MENSAJES.ERROR_NO_ENCONTRADO
        });
      }

      res.json({
        success: true,
        data: mantenimiento
      });
    } catch (error) {
      next(error);
    }
  },

  // Reprogramar mantenimiento
  async reprogramar(req, res, next) {
    try {
      const { id } = req.params;
      const { fecha_programada, hora_programada, motivo } = req.body;

      const mantenimiento = await MantenimientoProgramado.findByPk(id);

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: MENSAJES.ERROR_NO_ENCONTRADO
        });
      }

      await mantenimiento.update({
        fecha_programada,
        hora_programada,
        estado_id: ESTADOS_MANTENIMIENTO.REPROGRAMADO,
        reprogramaciones: mantenimiento.reprogramaciones + 1,
        ultimo_motivo_reprogramacion: motivo
      });

      res.json({
        success: true,
        message: 'Mantenimiento reprogramado exitosamente',
        data: mantenimiento
      });
    } catch (error) {
      next(error);
    }
  },

  // Registrar ejecución de mantenimiento
  async registrarEjecucion(req, res, next) {
    try {
      const { id } = req.params;
      const {
        fecha_ejecucion,
        hora_inicio,
        hora_fin,
        trabajo_realizado,
        observaciones,
        checklist,
        materiales,
        costo_real,
        firma_responsable,
        firma_recibe,
        nombre_recibe
      } = req.body;

      const mantenimiento = await MantenimientoProgramado.findByPk(id);

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: MENSAJES.ERROR_NO_ENCONTRADO
        });
      }

      // Calcular duración
      const duracion = hora_fin ? 
        require('moment')(hora_fin, 'HH:mm').diff(require('moment')(hora_inicio, 'HH:mm'), 'hours', true) : 
        null;

      // Crear ejecución
      const ejecucion = await MantenimientoEjecutado.create({
        mantenimiento_programado_id: id,
        fecha_ejecucion,
        hora_inicio,
        hora_fin,
        duracion_horas: duracion,
        ejecutado_por_usuario_id: req.usuario.id,
        trabajo_realizado,
        observaciones,
        costo_real,
        firma_responsable,
        firma_recibe,
        nombre_recibe
      });

      // Crear checklist si existe
      if (checklist && checklist.length > 0) {
        const checklistData = checklist.map(item => ({
          mantenimiento_ejecutado_id: ejecucion.id,
          ...item
        }));
        await EjecucionChecklist.bulkCreate(checklistData);
      }

      // Crear materiales si existen
      if (materiales && materiales.length > 0) {
        const materialesData = materiales.map(item => ({
          mantenimiento_ejecutado_id: ejecucion.id,
          ...item
        }));
        await EjecucionMaterial.bulkCreate(materialesData);
      }

      // Actualizar estado del mantenimiento
      await mantenimiento.update({
        estado_id: ESTADOS_MANTENIMIENTO.EJECUTADO
      });

      res.json({
        success: true,
        message: 'Ejecución registrada exitosamente',
        data: ejecucion
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener mantenimientos del día
  async obtenerDelDia(req, res, next) {
    try {
      const hoy = new Date().toISOString().split('T')[0];

      const mantenimientos = await MantenimientoProgramado.findAll({
        where: {
          fecha_programada: hoy,
          estado_id: {
            [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.EN_PROCESO]
          }
        },
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { model: Sede, as: 'sede' },
              { model: CategoriaMantenimiento, as: 'categoria' },
              { model: Equipo, as: 'equipo' }
            ]
          },
          { model: Estado, as: 'estado' }
        ],
        order: [['hora_programada', 'ASC']]
      });

      res.json({
        success: true,
        data: mantenimientos
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener mantenimientos próximos (siguiente semana)
  async obtenerProximos(req, res, next) {
    try {
      const hoy = new Date();
      const proximaSemana = new Date();
      proximaSemana.setDate(proximaSemana.getDate() + 7);

      const mantenimientos = await MantenimientoProgramado.findAll({
        where: {
          fecha_programada: {
            [Op.between]: [hoy.toISOString().split('T')[0], proximaSemana.toISOString().split('T')[0]]
          },
          estado_id: {
            [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.REPROGRAMADO]
          }
        },
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { model: Sede, as: 'sede' },
              { model: CategoriaMantenimiento, as: 'categoria' }
            ]
          },
          { model: Estado, as: 'estado' }
        ],
        order: [['fecha_programada', 'ASC']]
      });

      res.json({
        success: true,
        data: mantenimientos
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener mantenimientos atrasados
  async obtenerAtrasados(req, res, next) {
    try {
      const hoy = new Date().toISOString().split('T')[0];

      const mantenimientos = await MantenimientoProgramado.findAll({
        where: {
          fecha_programada: {
            [Op.lt]: hoy
          },
          estado_id: {
            [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.ATRASADO]
          }
        },
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { model: Sede, as: 'sede' },
              { model: CategoriaMantenimiento, as: 'categoria' }
            ]
          },
          { model: Estado, as: 'estado' }
        ],
        order: [['fecha_programada', 'ASC']]
      });

      res.json({
        success: true,
        data: mantenimientos
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = mantenimientosController;