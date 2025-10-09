// ============================================
// src/controllers/dashboardController.js
// ============================================
const { 
  MantenimientoProgramado,
  MantenimientoEjecutado,
  SolicitudAdicional,
  Equipo,
  Estado,
  CategoriaMantenimiento,
  Sede,
  Usuario
} = require('../models');
const { Op } = require('sequelize');
const { calcularPorcentaje } = require('../utils/helpers');

const dashboardController = {
  // Obtener KPIs principales
  async getKPIs(req, res, next) {
    try {
      const { mes, anio } = req.query;
      const mesActual = mes || new Date().getMonth() + 1;
      const anioActual = anio || new Date().getFullYear();

      // Obtener todas las sedes activas
      const sedes = await Sede.findAll({
        where: { activo: true },
        attributes: ['id', 'codigo', 'nombre']
      });

      // Para cada sede, calcular los KPIs
      const resultado = await Promise.all(sedes.map(async (sede) => {
        // Contar mantenimientos programados para esta sede
        const totalProgramados = await MantenimientoProgramado.count({
          where: {
            fecha_programada: {
              [Op.between]: [
                `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
              ]
            }
          }
        });

        // Contar mantenimientos ejecutados
        const totalEjecutados = await MantenimientoEjecutado.count({
          include: [{
            model: MantenimientoProgramado,
            as: 'programado',
            where: {
              fecha_programada: {
                [Op.between]: [
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
                ]
              }
            }
          }]
        });

        return {
          sede: sede.nombre,
          codigo: sede.codigo,
          programados: totalProgramados,
          ejecutados: totalEjecutados,
          cumplimiento: totalProgramados > 0 ? 
            parseFloat(((totalEjecutados / totalProgramados) * 100).toFixed(2)) : 0
        };
      }));

      res.json({
        success: true,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener cumplimiento por categoría
  async getCumplimientoPorCategoria(req, res, next) {
    try {
      const { mes, anio } = req.query;
      const mesActual = mes || new Date().getMonth() + 1;
      const anioActual = anio || new Date().getFullYear();

      const categorias = await CategoriaMantenimiento.findAll({
        where: { activo: true }
      });

      const resultado = await Promise.all(categorias.map(async (categoria) => {
        // Contar todos los mantenimientos programados
        const totalProgramados = await MantenimientoProgramado.count({
          where: {
            fecha_programada: {
              [Op.between]: [
                `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
              ]
            }
          }
        });

        // Contar mantenimientos ejecutados
        const totalEjecutados = await MantenimientoEjecutado.count({
          include: [{
            model: MantenimientoProgramado,
            as: 'programado',
            where: {
              fecha_programada: {
                [Op.between]: [
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
                ]
              }
            }
          }]
        });

        return {
          categoria: categoria.nombre,
          color: categoria.color || '#3B82F6',
          programados: totalProgramados,
          ejecutados: totalEjecutados,
          cumplimiento: totalProgramados > 0 ? 
            parseFloat(((totalEjecutados / totalProgramados) * 100).toFixed(2)) : 0
        };
      }));

      res.json({
        success: true,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener estadísticas de solicitudes
  async getEstadisticasSolicitudes(req, res, next) {
    try {
      const { mes, anio } = req.query;
      const mesActual = mes || new Date().getMonth() + 1;
      const anioActual = anio || new Date().getFullYear();

      const fechaInicio = `${anioActual}-${String(mesActual).padStart(2, '0')}-01`;
      const fechaFin = `${anioActual}-${String(mesActual).padStart(2, '0')}-31`;

      // Por prioridad
      const porPrioridad = await SolicitudAdicional.findAll({
        where: {
          fecha_solicitud: {
            [Op.between]: [fechaInicio, fechaFin]
          }
        },
        attributes: [
          'prioridad',
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total']
        ],
        group: ['prioridad'],
        raw: true
      });

      // Por tipo
      const porTipo = await SolicitudAdicional.findAll({
        where: {
          fecha_solicitud: {
            [Op.between]: [fechaInicio, fechaFin]
          }
        },
        attributes: [
          'tipo',
          [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'total']
        ],
        group: ['tipo'],
        raw: true
      });

      // Por estado
      const porEstado = await SolicitudAdicional.findAll({
        where: {
          fecha_solicitud: {
            [Op.between]: [fechaInicio, fechaFin]
          }
        },
        include: [{ 
          model: Estado, 
          as: 'estado',
          attributes: ['id', 'nombre', 'color']
        }],
        attributes: [
          'estado_id',
          [require('sequelize').fn('COUNT', require('sequelize').col('SolicitudAdicional.id')), 'total']
        ],
        group: ['estado_id', 'estado.id', 'estado.nombre', 'estado.color'],
        raw: true
      });

      // Tiempo promedio de respuesta
      const tiempoPromedio = await SolicitudAdicional.findOne({
        where: {
          fecha_solicitud: {
            [Op.between]: [fechaInicio, fechaFin]
          },
          tiempo_respuesta_horas: { [Op.not]: null }
        },
        attributes: [
          [require('sequelize').fn('AVG', require('sequelize').col('tiempo_respuesta_horas')), 'promedio_horas']
        ],
        raw: true
      });

      res.json({
        success: true,
        data: {
          por_prioridad: porPrioridad,
          por_tipo: porTipo,
          por_estado: porEstado.map(item => ({
            estado_id: item.estado_id,
            total: parseInt(item.total),
            estado: {
              id: item['estado.id'],
              nombre: item['estado.nombre'],
              color: item['estado.color']
            }
          })),
          tiempo_promedio_respuesta: tiempoPromedio?.promedio_horas ? 
            parseFloat(tiempoPromedio.promedio_horas).toFixed(2) : 0
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener actividad reciente
  async getActividadReciente(req, res, next) {
    try {
      const limite = parseInt(req.query.limite) || 10;

      // Últimos mantenimientos ejecutados
      const ultimosMantenimientos = await MantenimientoEjecutado.findAll({
        limit: limite,
        include: [
          {
            model: MantenimientoProgramado,
            as: 'programado',
            attributes: ['id', 'codigo', 'fecha_programada']
          },
          { 
            model: Usuario, 
            as: 'usuario', 
            attributes: ['id', 'nombre', 'apellido'] 
          }
        ],
        order: [['created_at', 'DESC']]
      });

      // Últimas solicitudes
      const ultimasSolicitudes = await SolicitudAdicional.findAll({
        limit: limite,
        include: [
          { 
            model: Usuario, 
            as: 'solicitante', 
            attributes: ['id', 'nombre', 'apellido'] 
          },
          { 
            model: Sede, 
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre']
          },
          { 
            model: Estado, 
            as: 'estado',
            attributes: ['id', 'nombre', 'color']
          }
        ],
        order: [['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          mantenimientos: ultimosMantenimientos,
          solicitudes: ultimasSolicitudes
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener cumplimiento por sede
  async getCumplimientoPorSede(req, res, next) {
    try {
      const { mes, anio } = req.query;
      const mesActual = mes || new Date().getMonth() + 1;
      const anioActual = anio || new Date().getFullYear();

      const sedes = await Sede.findAll({
        where: { activo: true },
        attributes: ['id', 'codigo', 'nombre']
      });

      const resultado = await Promise.all(sedes.map(async (sede) => {
        const totalProgramados = await MantenimientoProgramado.count({
          where: {
            fecha_programada: {
              [Op.between]: [
                `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
              ]
            }
          }
        });

        const totalEjecutados = await MantenimientoEjecutado.count({
          include: [{
            model: MantenimientoProgramado,
            as: 'programado',
            where: {
              fecha_programada: {
                [Op.between]: [
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-01`,
                  `${anioActual}-${String(mesActual).padStart(2, '0')}-31`
                ]
              }
            }
          }]
        });

        return {
          sede: sede.nombre,
          codigo: sede.codigo,
          programados: totalProgramados,
          ejecutados: totalEjecutados,
          cumplimiento: totalProgramados > 0 ? 
            parseFloat(((totalEjecutados / totalProgramados) * 100).toFixed(2)) : 0
        };
      }));

      res.json({
        success: true,
        data: resultado
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = dashboardController;