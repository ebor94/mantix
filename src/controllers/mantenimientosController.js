// ============================================
// src/controllers/mantenimientosController.js
// ============================================
const db = require('../models');
const { Op } = require('sequelize');
const { paginar, formatearRespuestaPaginada, calcularPorcentaje } = require('../utils/helpers');
const { MENSAJES, ESTADOS_MANTENIMIENTO } = require('../config/constants');
const pdfService = require('../services/pdfService');
// Destructurar modelos de forma segura
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
} = db;
console.log('Modelos cargados:', {
  MantenimientoProgramado: !!MantenimientoProgramado,
  MantenimientoEjecutado: !!MantenimientoEjecutado,
  PlanActividad: !!PlanActividad,
  Estado: !!Estado,
  Sede: !!Sede,
  Equipo: !!Equipo,
  Usuario: !!Usuario,
  Proveedor: !!Proveedor,
  CategoriaMantenimiento: !!CategoriaMantenimiento,
  EjecucionChecklist: !!EjecucionChecklist,
  EjecucionMaterial: !!EjecucionMaterial,
  EjecucionEvidencia: !!EjecucionEvidencia
});
// Función auxiliar para verificar si un modelo existe
const modelExists = (model) => model !== undefined && model !== null;

/**
 * Obtener IDs de categorías asignadas al usuario
 * Si es Administrador (rol_id = 1) O es_super_admin = true → retorna null (todas las categorías)
 * Si tiene otro rol y NO es super admin → retorna solo las categorías asignadas
 */
const obtenerCategoriasUsuario = async (usuarioId) => {
  try {
    const { Rol } = db;
    
    // Obtener usuario con su rol
    const usuario = await Usuario.findByPk(usuarioId, {
      include: [
        {
          model: Rol,
          as: 'rol',
          attributes: ['id', 'nombre']
        }
      ]
    });
    
    if (!usuario) {
      throw new Error('Usuario no encontrado');
    }

    console.log(`👤 Usuario: ${usuario.email}`);
    console.log(`   - Rol ID: ${usuario.rol_id}`);
    console.log(`   - Es Super Admin: ${usuario.es_super_admin}`);

    // ✅ VALIDACIÓN: Administrador (rol_id = 1) y Super Admin
    if (usuario.rol_id === 1 &&  usuario.es_super_admin === true) {
      console.log('✅ Usuario con permisos de administrador - Sin filtro de categorías');
      return null; // null = sin filtro, ve todas las categorías
    }

   // console.log('🔒 Usuario regular - Filtrando por categorías asignadas');

    // Obtener categorías asignadas al usuario
    const { UsuarioCategoria } = db;
    
    if (!modelExists(UsuarioCategoria)) {
      console.warn('⚠️ Modelo UsuarioCategoria no disponible');
      return [];
    }

    const usuarioCategorias = await UsuarioCategoria.findAll({
      where: { usuario_id: usuarioId },
      attributes: ['categoria_id']
    });

    const categoriasIds = usuarioCategorias.map(uc => uc.categoria_id);
    
    //console.log(`📋 Categorías asignadas al usuario:`, categoriasIds);

    return categoriasIds;
    
  } catch (error) {
    console.error('❌ Error al obtener categorías del usuario:', error);
    return [];
  }
};
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

    // Obtener categorías del usuario autenticado
    const usuarioId = req.usuario ? req.usuario.id : null;
    const categoriasUsuario = usuarioId ? await obtenerCategoriasUsuario(usuarioId) : null;

    console.log('🔍 Categorías del usuario:', categoriasUsuario);

    let planIds = null;

    // CRÍTICO: Filtrar por categorías
    if (categoriasUsuario !== null && categoriasUsuario.length > 0) {
      console.log('🔒 Aplicando filtro de categorías...');
      
      // Obtener planes permitidos
      const planesPermitidos = await PlanActividad.findAll({
        where: {
          categoria_id: { [Op.in]: categoriasUsuario }
        },
        attributes: ['id'],
        raw: true
      });

      planIds = planesPermitidos.map(p => p.id);
      
      console.log('📝 Total de planes permitidos:', planIds.length);

      if (planIds.length === 0) {
        console.log('⚠️ No hay planes - Retornando array vacío');
        return res.json(formatearRespuestaPaginada([], page, limit, 0));
      }

      // ✅ Aplicar filtro
      where.plan_actividad_id = { [Op.in]: planIds };
      
    } else {
      console.log('✅ Usuario administrador - Sin filtro');
    }

    // Construir includes
    const includes = [];

    if (modelExists(PlanActividad)) {
      const planActividadInclude = {
        model: PlanActividad,
        as: 'actividad',
        required: false,
        include: []
      };

      if (modelExists(Sede)) {
        const sedeInclude = {
          model: Sede,
          as: 'sede',
          required: false
        };
        if (sede_id) {
          sedeInclude.where = { id: sede_id };
        }
        planActividadInclude.include.push(sedeInclude);
      }

      if (modelExists(CategoriaMantenimiento)) {
        planActividadInclude.include.push({
          model: CategoriaMantenimiento,
          as: 'categoria',
          required: false
        });
      }

      if (modelExists(Equipo)) {
        planActividadInclude.include.push({
          model: Equipo,
          as: 'equipo',
          required: false
        });
      }

      if (modelExists(Usuario)) {
        planActividadInclude.include.push({
          model: Usuario,
          as: 'responsable_usuario',
          required: false
        });
      }

      if (modelExists(Proveedor)) {
        planActividadInclude.include.push({
          model: Proveedor,
          as: 'responsable_proveedor',
          required: false
        });
      }

      includes.push(planActividadInclude);
    }

    if (modelExists(Estado)) {
      includes.push({
        model: Estado,
        as: 'estado',
        required: false
      });
    }

    if (modelExists(MantenimientoEjecutado)) {
      includes.push({
        model: MantenimientoEjecutado,
        as: 'ejecucion',
        required: false
      });
    }

    // ✅ SOLUCIÓN: Separar count y findAll
    const count = await MantenimientoProgramado.count({
      where,
      distinct: true
    });

    console.log(`📊 Total con WHERE aplicado: ${count}`);

    const rows = await MantenimientoProgramado.findAll({
      where,
      include: includes,
      ...paginar(page, limit),
      order: [['fecha_programada', 'DESC']]
    });

    console.log(`📊 Registros en página ${page}: ${rows.length}`);

    res.json(formatearRespuestaPaginada(rows, page, limit, count));
    
  } catch (error) {
    console.error('❌ Error en listar:', error);
    console.error('Stack:', error.stack);
    next(error);
  }
},

  // Obtener mantenimiento por ID
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;

      const includes = [];

      // Include de PlanActividad
      if (modelExists(PlanActividad)) {
        const planActividadInclude = {
          model: PlanActividad,
          as: 'actividad',
          required: false,
          include: []
        };

        if (modelExists(Sede)) {
          planActividadInclude.include.push({
            model: Sede,
            as: 'sede',
            required: false
          });
        }

        if (modelExists(CategoriaMantenimiento)) {
          planActividadInclude.include.push({
            model: CategoriaMantenimiento,
            as: 'categoria',
            required: false
          });
        }

        if (modelExists(Equipo)) {
          planActividadInclude.include.push({
            model: Equipo,
            as: 'equipo',
            required: false
          });
        }

        if (modelExists(Usuario)) {
          planActividadInclude.include.push({
            model: Usuario,
            as: 'responsable_usuario',
            required: false
          });
        }

        if (modelExists(Proveedor)) {
          planActividadInclude.include.push({
            model: Proveedor,
            as: 'responsable_proveedor',
            required: false
          });
        }

        includes.push(planActividadInclude);
      }

      if (modelExists(Estado)) {
        includes.push({
          model: Estado,
          as: 'estado',
          required: false
        });
      }

      // Include de MantenimientoEjecutado con sus relaciones
      if (modelExists(MantenimientoEjecutado)) {
        const ejecucionInclude = {
          model: MantenimientoEjecutado,
          as: 'ejecucion',
          required: false,
          include: []
        };

        if (modelExists(EjecucionChecklist)) {
          ejecucionInclude.include.push({
            model: EjecucionChecklist,
            as: 'checklist',
            required: false
          });
        }

        if (modelExists(EjecucionMaterial)) {
          ejecucionInclude.include.push({
            model: EjecucionMaterial,
            as: 'materiales',
            required: false
          });
        }

        if (modelExists(EjecucionEvidencia)) {
          ejecucionInclude.include.push({
            model: EjecucionEvidencia,
            as: 'evidencias',
            required: false
          });
        }

        includes.push(ejecucionInclude);
      }

      const mantenimiento = await MantenimientoProgramado.findByPk(id, {
        include: includes
      });

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: MENSAJES.ERROR_NO_ENCONTRADO || 'Mantenimiento no encontrado'
        });
      }

      res.json({
        success: true,
        data: mantenimiento
      });
    } catch (error) {
      console.error('Error en obtenerPorId:', error);
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
          message: MENSAJES.ERROR_NO_ENCONTRADO || 'Mantenimiento no encontrado'
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
      console.error('Error en reprogramar:', error);
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
          message: MENSAJES.ERROR_NO_ENCONTRADO || 'Mantenimiento no encontrado'
        });
      }

      // Calcular duración
      let duracion = null;
      if (hora_inicio && hora_fin) {
        const moment = require('moment');
        duracion = moment(hora_fin, 'HH:mm').diff(moment(hora_inicio, 'HH:mm'), 'hours', true);
      }

      // Crear ejecución
      const ejecucion = await MantenimientoEjecutado.create({
        mantenimiento_programado_id: id,
        fecha_ejecucion,
        hora_inicio,
        hora_fin,
        duracion_horas: duracion,
        ejecutado_por_usuario_id: req.usuario ? req.usuario.id : null,
        trabajo_realizado,
        observaciones,
        costo_real,
        firma_responsable,
        firma_recibe,
        nombre_recibe
      });

      // Crear checklist si existe y el modelo está disponible
      if (checklist && Array.isArray(checklist) && checklist.length > 0 && modelExists(EjecucionChecklist)) {
        const checklistData = checklist.map(item => ({
          mantenimiento_ejecutado_id: ejecucion.id,
          ...item
        }));
        await EjecucionChecklist.bulkCreate(checklistData);
      }

      // Crear materiales si existen y el modelo está disponible
      if (materiales && Array.isArray(materiales) && materiales.length > 0 && modelExists(EjecucionMaterial)) {
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
      console.error('Error en registrarEjecucion:', error);
      next(error);
    }
  },

  // Registrar ejecución múltiple (batch) - aplica los mismos datos de cierre a varios mantenimientos
  async registrarEjecucionMultiple(req, res, next) {
    const {
      mantenimiento_ids,
      fecha_ejecucion,
      hora_inicio,
      hora_fin,
      trabajo_realizado,
      observaciones,
      costo_real,
      nombre_recibe
    } = req.body;

    if (!Array.isArray(mantenimiento_ids) || mantenimiento_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe enviar al menos un mantenimiento_id'
      });
    }

    if (!fecha_ejecucion || !trabajo_realizado) {
      return res.status(400).json({
        success: false,
        message: 'fecha_ejecucion y trabajo_realizado son requeridos'
      });
    }

    const t = await db.sequelize.transaction();
    try {
      const mantenimientos = await MantenimientoProgramado.findAll({
        where: { id: { [Op.in]: mantenimiento_ids } },
        transaction: t
      });

      if (mantenimientos.length !== mantenimiento_ids.length) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: 'Uno o más mantenimientos no existen'
        });
      }

      let duracion = null;
      if (hora_inicio && hora_fin) {
        const moment = require('moment');
        duracion = moment(hora_fin, 'HH:mm').diff(moment(hora_inicio, 'HH:mm'), 'hours', true);
      }

      const ejecuciones = [];
      for (const m of mantenimientos) {
        const ejecucion = await MantenimientoEjecutado.create({
          mantenimiento_programado_id: m.id,
          fecha_ejecucion,
          hora_inicio,
          hora_fin,
          duracion_horas: duracion,
          ejecutado_por_usuario_id: req.usuario ? req.usuario.id : null,
          trabajo_realizado,
          observaciones,
          costo_real,
          nombre_recibe
        }, { transaction: t });

        await m.update(
          { estado_id: ESTADOS_MANTENIMIENTO.EJECUTADO },
          { transaction: t }
        );

        ejecuciones.push(ejecucion);
      }

      await t.commit();

      res.json({
        success: true,
        message: `${ejecuciones.length} ejecuciones registradas exitosamente`,
        data: ejecuciones
      });
    } catch (error) {
      await t.rollback();
      console.error('Error en registrarEjecucionMultiple:', error);
      next(error);
    }
  },

  // Obtener mantenimientos del día
async obtenerDelDia(req, res, next) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const where = {
      fecha_programada: hoy,
      estado_id: {
        [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.EN_PROCESO]
      }
    };

    // ✅ Obtener categorías del usuario
    const usuarioId = req.usuario ? req.usuario.id : null;
    const categoriasUsuario = usuarioId ? await obtenerCategoriasUsuario(usuarioId) : null;

    // ✅ Aplicar filtro por categorías
    if (categoriasUsuario !== null && categoriasUsuario.length > 0) {
      const planesPermitidos = await PlanActividad.findAll({
        where: { categoria_id: { [Op.in]: categoriasUsuario } },
        attributes: ['id'],
        raw: true
      });

      const planIds = planesPermitidos.map(p => p.id);

      if (planIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      where.plan_actividad_id = { [Op.in]: planIds };
    }

    const includes = [];

    if (modelExists(PlanActividad)) {
      const planActividadInclude = {
        model: PlanActividad,
        as: 'actividad',
        required: false,
        include: []
      };

      if (modelExists(Sede)) {
        planActividadInclude.include.push({ model: Sede, as: 'sede', required: false });
      }

      if (modelExists(CategoriaMantenimiento)) {
        planActividadInclude.include.push({ model: CategoriaMantenimiento, as: 'categoria', required: false });
      }

      if (modelExists(Equipo)) {
        planActividadInclude.include.push({ model: Equipo, as: 'equipo', required: false });
      }

      includes.push(planActividadInclude);
    }

    if (modelExists(Estado)) {
      includes.push({ model: Estado, as: 'estado', required: false });
    }

    const mantenimientos = await MantenimientoProgramado.findAll({
      where,
      include: includes,
      order: [['hora_programada', 'ASC']]
    });

    res.json({
      success: true,
      data: mantenimientos
    });
  } catch (error) {
    console.error('Error en obtenerDelDia:', error);
    next(error);
  }
},

  // Obtener mantenimientos próximos (siguiente semana)
async obtenerProximos(req, res, next) {
  try {
    const hoy = new Date();
    const proximaSemana = new Date();
    proximaSemana.setDate(proximaSemana.getDate() + 30);

    const where = {
      fecha_programada: {
        [Op.between]: [hoy.toISOString().split('T')[0], proximaSemana.toISOString().split('T')[0]]
      },
      estado_id: {
        [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.REPROGRAMADO]
      }
    };

    // ✅ Obtener categorías del usuario
    const usuarioId = req.usuario ? req.usuario.id : null;
    const categoriasUsuario = usuarioId ? await obtenerCategoriasUsuario(usuarioId) : null;

    // ✅ Aplicar filtro por categorías
    if (categoriasUsuario !== null && categoriasUsuario.length > 0) {
      const planesPermitidos = await PlanActividad.findAll({
        where: { categoria_id: { [Op.in]: categoriasUsuario } },
        attributes: ['id'],
        raw: true
      });

      const planIds = planesPermitidos.map(p => p.id);

      if (planIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      where.plan_actividad_id = { [Op.in]: planIds };
    }

    const includes = [];

    if (modelExists(PlanActividad)) {
      const planActividadInclude = {
        model: PlanActividad,
        as: 'actividad',
        required: false,
        include: []
      };

      if (modelExists(Sede)) {
        planActividadInclude.include.push({ model: Sede, as: 'sede', required: false });
      }

      if (modelExists(CategoriaMantenimiento)) {
        planActividadInclude.include.push({ model: CategoriaMantenimiento, as: 'categoria', required: false });
      }

      includes.push(planActividadInclude);
    }

    if (modelExists(Estado)) {
      includes.push({ model: Estado, as: 'estado', required: false });
    }

    const mantenimientos = await MantenimientoProgramado.findAll({
      where,
      include: includes,
      order: [['fecha_programada', 'ASC']]
    });

    res.json({
      success: true,
      data: mantenimientos
    });
  } catch (error) {
    console.error('Error en obtenerProximos:', error);
    next(error);
  }
},

  // Obtener mantenimientos atrasados
async obtenerAtrasados(req, res, next) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const where = {
      fecha_programada: {
        [Op.lt]: hoy
      },
      estado_id: {
        [Op.in]: [ESTADOS_MANTENIMIENTO.PROGRAMADO, ESTADOS_MANTENIMIENTO.ATRASADO]
      }
    };

    // ✅ Obtener categorías del usuario
    const usuarioId = req.usuario ? req.usuario.id : null;
    const categoriasUsuario = usuarioId ? await obtenerCategoriasUsuario(usuarioId) : null;

    // ✅ Aplicar filtro por categorías
    if (categoriasUsuario !== null && categoriasUsuario.length > 0) {
      const planesPermitidos = await PlanActividad.findAll({
        where: { categoria_id: { [Op.in]: categoriasUsuario } },
        attributes: ['id'],
        raw: true
      });

      const planIds = planesPermitidos.map(p => p.id);

      if (planIds.length === 0) {
        return res.json({ success: true, data: [] });
      }

      where.plan_actividad_id = { [Op.in]: planIds };
    }

    const includes = [];

    if (modelExists(PlanActividad)) {
      const planActividadInclude = {
        model: PlanActividad,
        as: 'actividad',
        required: false,
        include: []
      };

      if (modelExists(Sede)) {
        planActividadInclude.include.push({ model: Sede, as: 'sede', required: false });
      }

      if (modelExists(CategoriaMantenimiento)) {
        planActividadInclude.include.push({ model: CategoriaMantenimiento, as: 'categoria', required: false });
      }

      includes.push(planActividadInclude);
    }

    if (modelExists(Estado)) {
      includes.push({ model: Estado, as: 'estado', required: false });
    }

    const mantenimientos = await MantenimientoProgramado.findAll({
      where,
      include: includes,
      order: [['fecha_programada', 'ASC']]
    });

    res.json({
      success: true,
      data: mantenimientos
    });
  } catch (error) {
    console.error('Error en obtenerAtrasados:', error);
    next(error);
  }
},
  /**
 * Generar PDF de mantenimiento
 */
   async generarPDF(req, res, next) {
    try {
      const { id } = req.params;

      // Obtener mantenimiento completo con todas las relaciones
      const mantenimiento = await MantenimientoProgramado.findByPk(id, {
        include: [
          {
            model: PlanActividad,
            as: 'actividad',
            include: [
              { model: Sede, as: 'sede' },
               { model: CategoriaMantenimiento, as: 'categoria' },
              { model: Equipo, as: 'equipo' },
              { model: Usuario, as: 'responsable_usuario' }
            ]
          },
          {
            model: Estado,
            as: 'estado'
          },
          {
            model: MantenimientoEjecutado,
            as: 'ejecucion',
            include: [
              {
                model: EjecucionChecklist,
                as: 'checklist',
                order: [['orden', 'ASC']]
              },
              {
                model: EjecucionMaterial,
                as: 'materiales'
              },
              {
                model: EjecucionEvidencia,
                as: 'evidencias'
              }
            ]
          }
        ]
      });

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: 'Mantenimiento no encontrado'
        });
      }
     // console.log('Mantenimiento para PDF:', mantenimiento);
      // Generar PDF
      const resultado = await pdfService.generarPDFMantenimiento(mantenimiento);

      res.json({
        success: true,
        message: 'PDF generado exitosamente',
        data: resultado
      });

    } catch (error) {
      console.error('Error al generar PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error al generar el PDF',
        error: error.message
      });
    }
  },
  /**
   * Descargar PDF de mantenimiento
   */
   async descargarPDF(req, res, next) {
    try {
      const { id } = req.params;

      // Obtener mantenimiento completo
      const mantenimiento = await MantenimientoProgramado.findByPk(id, {
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
          {
            model: Estado,
            as: 'estado'
          },
          {
            model: MantenimientoEjecutado,
            as: 'ejecucion',
            include: [
              {
                model: EjecucionChecklist,
                as: 'checklist',
                order: [['orden', 'ASC']]
              },
              {
                model: EjecucionMaterial,
                as: 'materiales'
              },
              {
                model: EjecucionEvidencia,
                as: 'evidencias'
              }
            ]
          }
        ]
      });

      if (!mantenimiento) {
        return res.status(404).json({
          success: false,
          message: 'Mantenimiento no encontrado'
        });
      }

      // Generar PDF
      const resultado = await pdfService.generarPDFMantenimiento(mantenimiento);

      // Descargar el archivo
      res.download(resultado.filePath, `mantenimiento_${mantenimiento.codigo}.pdf`, (err) => {
        if (err) {
          console.error('Error al descargar PDF:', err);
          res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF'
          });
        }
      });

    } catch (error) {
      console.error('Error al descargar PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error al descargar el PDF',
        error: error.message
      });
    }
  }
};


module.exports = mantenimientosController;