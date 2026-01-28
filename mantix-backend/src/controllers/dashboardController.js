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
  Usuario,
  sequelize
} = require('../models');
const { QueryTypes } = require('sequelize');
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
            as: 'mantenimiento_programado',  // ✅ CORRECTO
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
            as: 'mantenimiento_programado',  // ✅ CORRECTO
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
            as: 'mantenimiento_programado',
            attributes: ['id', 'codigo', 'fecha_programada']
          },
          { 
            model: Usuario, 
            as: 'usuario_ejecutor', 
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
            as: 'mantenimiento_programado',  // ✅ CORRECTO
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

  // ============================================
// OBTENER INDICADOR DE CUMPLIMIENTO
// ============================================
async getCumplimiento(req, res){
  try {
    const { 
      periodo = 'mensual',  // diario, semanal, mensual, anual
      sede_id,              // null = todas las sedes
      categoria_id          // null = todas las categorías
    } = req.query;

    // Validar período
     const periodosValidos = ['semanal', 'mensual', 'trimestral', 'anual']; // ✅ Cambiado
    if (!periodosValidos.includes(periodo)) {
      return res.status(400).json({
        success: false,
        message: `Período inválido. Valores permitidos: ${periodosValidos.join(', ')}`
      });
    }

    // Calcular fechas según el período
    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
      case 'diario':
        fechaInicio = fechaFin = hoy.toISOString().split('T')[0];
        break;
      
      case 'semanal':
        // Lunes de la semana actual
        const diaSemana = hoy.getDay();
        const diff = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
        const primerDiaSemana = new Date(hoy.getFullYear(), hoy.getMonth(), diff);
        const ultimoDiaSemana = new Date(primerDiaSemana);
        ultimoDiaSemana.setDate(primerDiaSemana.getDate() + 6);
        
        fechaInicio = primerDiaSemana.toISOString().split('T')[0];
        fechaFin = ultimoDiaSemana.toISOString().split('T')[0];
        break;
      
      case 'mensual':
        const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        
        fechaInicio = primerDiaMes.toISOString().split('T')[0];
        fechaFin = ultimoDiaMes.toISOString().split('T')[0];
        break;

      case 'trimestral': // ✅ NUEVO
        const mesActual = hoy.getMonth();
        const trimestreActual = Math.floor(mesActual / 3);
        const primerMesTrimestre = trimestreActual * 3;
        const ultimoMesTrimestre = primerMesTrimestre + 2;
        
        const primerDiaTrimestre = new Date(hoy.getFullYear(), primerMesTrimestre, 1);
        const ultimoDiaTrimestre = new Date(hoy.getFullYear(), ultimoMesTrimestre + 1, 0);
        
        fechaInicio = primerDiaTrimestre.toISOString().split('T')[0];
        fechaFin = ultimoDiaTrimestre.toISOString().split('T')[0];
        break;
      
      case 'anual':
        fechaInicio = `${hoy.getFullYear()}-01-01`;
        fechaFin = `${hoy.getFullYear()}-12-31`;
        break;
    }

    // Construir condiciones WHERE dinámicas
    const whereConditions = [
      'periodo = :periodo',
      'fecha_inicio = :fechaInicio',
      'fecha_fin = :fechaFin'
    ];

    const replacements = {
      periodo,
      fechaInicio,
      fechaFin
    };

    // Filtro por sede (opcional)
    if (sede_id) {
      whereConditions.push('sede_id = :sedeId');
      replacements.sedeId = sede_id;
    } else {
      whereConditions.push('sede_id IS NULL');
    }

    // Filtro por categoría (opcional)
    if (categoria_id) {
      whereConditions.push('categoria_id = :categoriaId');
      replacements.categoriaId = categoria_id;
    } else {
      whereConditions.push('categoria_id IS NULL');
    }

    // Buscar indicador en la tabla
    const [indicador] = await sequelize.query(`
      SELECT 
        id,
        periodo,
        fecha_inicio,
        fecha_fin,
        total_programados,
        total_ejecutados,
        total_en_proceso,
        total_atrasados,
        porcentaje_cumplimiento,
        sede_id,
        categoria_id,
        updated_at
      FROM indicadores_cumplimiento
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT 1
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    // Si no existe el indicador, devolver valores en cero (fallback)
    if (!indicador) {
      return res.json({
        success: true,
        data: {
          periodo,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          total_programados: 0,
          total_ejecutados: 0,
          total_en_proceso: 0,
          total_atrasados: 0,
          porcentaje_cumplimiento: 0,
          sede_id: sede_id || null,
          categoria_id: categoria_id || null,
          mensaje: 'Indicador en proceso de cálculo'
        }
      });
    }

    res.json({
      success: true,
      data: indicador
    });

  } catch (error) {
    console.error('Error al obtener cumplimiento:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener indicador de cumplimiento',
      error: error.message
    });
  }
},

// ============================================
// OBTENER MÚLTIPLES INDICADORES (POR SEDE O CATEGORÍA)
// ============================================
 async getCumplimientoMultiple(req, res){
  try {
    const { 
      periodo = 'mensual',
      tipo = 'sede'  // 'sede' o 'categoria'
    } = req.query;

    // Validar período
    const periodosValidos = ['diario', 'semanal', 'mensual', 'anual'];
    if (!periodosValidos.includes(periodo)) {
      return res.status(400).json({
        success: false,
        message: `Período inválido. Valores permitidos: ${periodosValidos.join(', ')}`
      });
    }

    // Validar tipo
    if (!['sede', 'categoria'].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo inválido. Valores permitidos: sede, categoria'
      });
    }

    // Calcular fechas
    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
      case 'diario':
        fechaInicio = fechaFin = hoy.toISOString().split('T')[0];
        break;
      
      case 'semanal':
        const diaSemana = hoy.getDay();
        const diff = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
        const primerDiaSemana = new Date(hoy.getFullYear(), hoy.getMonth(), diff);
        const ultimoDiaSemana = new Date(primerDiaSemana);
        ultimoDiaSemana.setDate(primerDiaSemana.getDate() + 6);
        
        fechaInicio = primerDiaSemana.toISOString().split('T')[0];
        fechaFin = ultimoDiaSemana.toISOString().split('T')[0];
        break;
      
      case 'mensual':
        const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        
        fechaInicio = primerDiaMes.toISOString().split('T')[0];
        fechaFin = ultimoDiaMes.toISOString().split('T')[0];
        break;
      
      case 'anual':
        fechaInicio = `${hoy.getFullYear()}-01-01`;
        fechaFin = `${hoy.getFullYear()}-12-31`;
        break;
    }

    // Construir query según el tipo
    let query;
    if (tipo === 'sede') {
      query = `
        SELECT 
          ic.*,
          s.nombre as nombre_sede,
          s.codigo as codigo_sede
        FROM indicadores_cumplimiento ic
        INNER JOIN sedes s ON ic.sede_id = s.id
        WHERE ic.periodo = :periodo
          AND ic.fecha_inicio = :fechaInicio
          AND ic.fecha_fin = :fechaFin
          AND ic.sede_id IS NOT NULL
          AND ic.categoria_id IS NULL
        ORDER BY ic.porcentaje_cumplimiento DESC
      `;
    } else {
      query = `
        SELECT 
          ic.*,
          cm.nombre as nombre_categoria
        FROM indicadores_cumplimiento ic
        INNER JOIN categorias_mantenimiento cm ON ic.categoria_id = cm.id
        WHERE ic.periodo = :periodo
          AND ic.fecha_inicio = :fechaInicio
          AND ic.fecha_fin = :fechaFin
          AND ic.categoria_id IS NOT NULL
          AND ic.sede_id IS NULL
        ORDER BY ic.porcentaje_cumplimiento DESC
      `;
    }

    const indicadores = await sequelize.query(query, {
      replacements: { periodo, fechaInicio, fechaFin },
      type: QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: indicadores,
      total: indicadores.length
    });

  } catch (error) {
    console.error('Error al obtener cumplimiento múltiple:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener indicadores',
      error: error.message
    });
  }
}
};

module.exports = dashboardController;