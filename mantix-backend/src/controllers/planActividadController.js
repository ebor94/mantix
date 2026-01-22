// ============================================
// src/controllers/planActividadController.js
// ============================================
const {
  sequelize,
  PlanActividad,
  PlanMantenimiento,
  CategoriaMantenimiento,
  Sede,
  Usuario,
  Periodicidad,
  Equipo,
  MantenimientoProgramado,
  UsuarioCategoria,
  Rol,
  Proveedor
} = require('../models');
const { generarGrupoMasivoId } = require('../utils/grupoMasivoHelper');
const { Op } = require('sequelize');

const planActividadController = {
  // Obtener todas las actividades (filtradas por categorías del usuario)
  async obtenerTodas(req, res, next) {
    try {
      const { plan_id, sede_id, categoria_id, activo, page = 1, limit = 10 } = req.query;
      const usuarioId = req.usuario.id;

      // Verificar usuario
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      // Construir condiciones WHERE
      const whereCondition = {};
      if (plan_id) whereCondition.plan_id = plan_id;
      if (sede_id) whereCondition.sede_id = sede_id;
      if (activo !== undefined) whereCondition.activo = activo === 'true';

      // Filtrar por categorías permitidas si no es super admin
      if (!usuario.es_super_admin) {
        const usuarioCategorias = await UsuarioCategoria.findAll({
          where: { usuario_id: usuarioId },
          attributes: ['categoria_id']
        });

        const categoriasIds = usuarioCategorias.map(uc => uc.categoria_id);

        if (categoriasIds.length === 0) {
          return res.status(200).json({
            success: true,
            data: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: 0
            }
          });
        }

        // Si se especificó una categoría, verificar que tenga acceso
        if (categoria_id) {
          if (!categoriasIds.includes(parseInt(categoria_id))) {
            return res.status(403).json({
              success: false,
              message: 'No tienes permiso para ver actividades de esta categoría'
            });
          }
          whereCondition.categoria_id = parseInt(categoria_id);
        } else {
          // Filtrar solo categorías permitidas
          whereCondition.categoria_id = {
            [Op.in]: categoriasIds
          };
        }
      } else if (categoria_id) {
        // Super admin puede filtrar por cualquier categoría
        whereCondition.categoria_id = parseInt(categoria_id);
      }

      // Paginación
      const offset = (page - 1) * limit;

      const { count, rows } = await PlanActividad.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'color', 'icono']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre', 'ciudad']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido', 'email']
          }
        ],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['nombre', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Error al obtener actividades:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las actividades',
        error: error.message
      });
    }
  },

  // Nuevo: Obtener actividades por categoría
  async obtenerPorCategoria(req, res, next) {
    try {
      const { categoriaId } = req.params;
      const usuarioId = req.usuario.id;

      // Verificar permisos
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(parseInt(categoriaId));
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para ver actividades de esta categoría'
          });
        }
      }

      const actividades = await PlanActividad.findAll({
        where: {
          categoria_id: categoriaId,
          activo: true
        },
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'color', 'icono']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre', 'ciudad']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido']
          }
        ],
        order: [['nombre', 'ASC']]
      });

      res.status(200).json({
        success: true,
        data: actividades
      });
    } catch (error) {
      console.error('Error al obtener actividades por categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las actividades',
        error: error.message
      });
    }
  },
  // Obtener actividad por ID (con verificación de permisos)
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const actividad = await PlanActividad.findByPk(id, {
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio', 'fecha_inicio', 'fecha_fin']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre', 'ciudad', 'direccion']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre', 'marca', 'modelo']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias', 'descripcion']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      if (!actividad) {
        return res.status(404).json({
          success: false,
          message: 'Actividad no encontrada'
        });
      }

      // Verificar permisos (el middleware ya lo hizo, pero por seguridad)
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(actividad.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para ver esta actividad'
          });
        }
      }

      res.status(200).json({
        success: true,
        data: actividad
      });
    } catch (error) {
      console.error('Error al obtener actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener la actividad',
        error: error.message
      });
    }
  },

  // Crear nueva actividad (con verificación de permisos)
  async crear(req, res, next) {
    try {
      const {
        plan_id,
        categoria_id,
        tipo_mantenimiento_id,
        nombre,
        descripcion,
        sede_id,
        equipo_id,
        periodicidad_id,
        responsable_tipo,
        responsable_usuario_id,
        responsable_proveedor_id,
        duracion_estimada_horas,
        costo_estimado,
        observaciones,
        activo
      } = req.body;

      const usuarioId = req.usuario.id;

      // Validaciones básicas
      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre es requerido'
        });
      }

      if (!plan_id || !categoria_id || !sede_id || !periodicidad_id || !responsable_tipo) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos requeridos deben ser proporcionados'
        });
      }

      // Verificar permisos sobre la categoría
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para crear actividades en esta categoría'
          });
        }
      }

      // Verificar que el plan existe
      const plan = await PlanMantenimiento.findByPk(plan_id);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Verificar que la categoría existe
      const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar que la sede existe
      const sede = await Sede.findByPk(sede_id);
      if (!sede) {
        return res.status(404).json({
          success: false,
          message: 'Sede no encontrada'
        });
      }

      // Verificar que la periodicidad existe
      const periodicidad = await Periodicidad.findByPk(periodicidad_id);
      if (!periodicidad) {
        return res.status(404).json({
          success: false,
          message: 'Periodicidad no encontrada'
        });
      }

      // Verificar equipo si se proporciona
      if (equipo_id) {
        const equipo = await Equipo.findByPk(equipo_id);
        if (!equipo) {
          return res.status(404).json({
            success: false,
            message: 'Equipo no encontrado'
          });
        }

        // Verificar que el equipo pertenece a la categoría correcta
        if (equipo.categoria_id !== parseInt(categoria_id)) {
          return res.status(400).json({
            success: false,
            message: 'El equipo no pertenece a la categoría seleccionada'
          });
        }
      }

      // Validar responsable según tipo
      if (responsable_tipo === 'interno') {
        if (!responsable_usuario_id) {
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar un responsable usuario para tipo interno'
          });
        }

        const responsable = await Usuario.findByPk(responsable_usuario_id);
        if (!responsable) {
          return res.status(404).json({
            success: false,
            message: 'Usuario responsable no encontrado'
          });
        }
      } else if (responsable_tipo === 'externo') {
        if (!responsable_proveedor_id) {
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar un proveedor para tipo proveedor'
          });
        }
        // Aquí podrías validar que el proveedor existe si tienes el modelo
      }

      // Crear la actividad
      const nuevaActividad = await PlanActividad.create({
        plan_id,
        categoria_id,
        tipo_mantenimiento_id,
        nombre,
        descripcion,
        sede_id,
        equipo_id,
        periodicidad_id,
        responsable_tipo,
        responsable_usuario_id: responsable_tipo === 'interno' ? responsable_usuario_id : null,
        responsable_proveedor_id: responsable_tipo === 'externo' ? responsable_proveedor_id : null,
        duracion_estimada_horas,
        costo_estimado,
        observaciones,
        activo: activo !== undefined ? activo : true
      });

      // Obtener la actividad creada con todas sus relaciones
      const actividadCreada = await PlanActividad.findByPk(nuevaActividad.id, {
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'color']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido']
          }
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Actividad creada exitosamente',
        data: actividadCreada
      });
    } catch (error) {
      console.error('Error al crear actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear la actividad',
        error: error.message
      });
    }
  },

  // Actualizar actividad (con verificación de permisos)
  async actualizar(req, res, next) {
    try {
      const { id } = req.params;
      const {
        plan_id,
        categoria_id,
        tipo_mantenimiento_id,
        nombre,
        descripcion,
        sede_id,
        equipo_id,
        periodicidad_id,
        responsable_tipo,
        responsable_usuario_id,
        responsable_proveedor_id,
        duracion_estimada_horas,
        costo_estimado,
        observaciones,
        activo
      } = req.body;

      const usuarioId = req.usuario.id;

      // Buscar actividad
      const actividad = await PlanActividad.findByPk(id);

      if (!actividad) {
        return res.status(404).json({
          success: false,
          message: 'Actividad no encontrada'
        });
      }

      // Verificar permisos sobre la categoría actual
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(actividad.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para editar esta actividad'
          });
        }

        // Si está cambiando de categoría, verificar permisos en la nueva
        if (categoria_id && categoria_id !== actividad.categoria_id) {
          const tieneAccesoNuevaCategoria = await usuario.tieneAccesoCategoria(categoria_id);
          if (!tieneAccesoNuevaCategoria) {
            return res.status(403).json({
              success: false,
              message: 'No tienes permiso para mover la actividad a esa categoría'
            });
          }
        }
      }

      // Validaciones de existencia de relaciones
      if (plan_id && plan_id !== actividad.plan_id) {
        const plan = await PlanMantenimiento.findByPk(plan_id);
        if (!plan) {
          return res.status(404).json({
            success: false,
            message: 'Plan de mantenimiento no encontrado'
          });
        }
      }

      if (categoria_id && categoria_id !== actividad.categoria_id) {
        const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
        if (!categoria) {
          return res.status(404).json({
            success: false,
            message: 'Categoría no encontrada'
          });
        }
      }

      if (sede_id && sede_id !== actividad.sede_id) {
        const sede = await Sede.findByPk(sede_id);
        if (!sede) {
          return res.status(404).json({
            success: false,
            message: 'Sede no encontrada'
          });
        }
      }

      if (periodicidad_id && periodicidad_id !== actividad.periodicidad_id) {
        const periodicidad = await Periodicidad.findByPk(periodicidad_id);
        if (!periodicidad) {
          return res.status(404).json({
            success: false,
            message: 'Periodicidad no encontrada'
          });
        }
      }

      if (equipo_id) {
        const equipo = await Equipo.findByPk(equipo_id);
        if (!equipo) {
          return res.status(404).json({
            success: false,
            message: 'Equipo no encontrado'
          });
        }
      }

      // Validar responsable si cambia
      if (responsable_tipo === 'interno' && responsable_usuario_id) {
        const responsable = await Usuario.findByPk(responsable_usuario_id);
        if (!responsable) {
          return res.status(404).json({
            success: false,
            message: 'Usuario responsable no encontrado'
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (plan_id !== undefined) datosActualizacion.plan_id = plan_id;
      if (categoria_id !== undefined) datosActualizacion.categoria_id = categoria_id;
      if (tipo_mantenimiento_id !== undefined) datosActualizacion.tipo_mantenimiento_id = tipo_mantenimiento_id;
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;
      if (sede_id !== undefined) datosActualizacion.sede_id = sede_id;
      if (equipo_id !== undefined) datosActualizacion.equipo_id = equipo_id;
      if (periodicidad_id !== undefined) datosActualizacion.periodicidad_id = periodicidad_id;
      if (responsable_tipo !== undefined) datosActualizacion.responsable_tipo = responsable_tipo;
      if (responsable_usuario_id !== undefined) datosActualizacion.responsable_usuario_id = responsable_usuario_id;
      if (responsable_proveedor_id !== undefined) datosActualizacion.responsable_proveedor_id = responsable_proveedor_id;
      if (duracion_estimada_horas !== undefined) datosActualizacion.duracion_estimada_horas = duracion_estimada_horas;
      if (costo_estimado !== undefined) datosActualizacion.costo_estimado = costo_estimado;
      if (observaciones !== undefined) datosActualizacion.observaciones = observaciones;
      if (activo !== undefined) datosActualizacion.activo = activo;

      // Actualizar
      await actividad.update(datosActualizacion);

      // Obtener actividad actualizada con relaciones
      const actividadActualizada = await PlanActividad.findByPk(id, {
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'color']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido']
          }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Actividad actualizada exitosamente',
        data: actividadActualizada
      });
    } catch (error) {
      console.error('Error al actualizar actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar la actividad',
        error: error.message
      });
    }
  },

  // Toggle activo (con verificación de permisos)
  async toggleActivo(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const actividad = await PlanActividad.findByPk(id);

      if (!actividad) {
        return res.status(404).json({
          success: false,
          message: 'Actividad no encontrada'
        });
      }

      // Verificar permisos (el middleware ya lo hizo, pero por seguridad)
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(actividad.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para modificar esta actividad'
          });
        }
      }

      await actividad.update({ activo: !actividad.activo });

      res.status(200).json({
        success: true,
        message: `Actividad ${actividad.activo ? 'activada' : 'desactivada'} exitosamente`,
        data: actividad
      });
    } catch (error) {
      console.error('Error al cambiar estado de actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar el estado de la actividad',
        error: error.message
      });
    }
  },

  // Eliminar actividad (con verificación de permisos)
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const actividad = await PlanActividad.findByPk(id);

      if (!actividad) {
        return res.status(404).json({
          success: false,
          message: 'Actividad no encontrada'
        });
      }

      // Verificar permisos
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(actividad.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para eliminar esta actividad'
          });
        }
      }

      // Verificar si tiene mantenimientos programados
      const mantenimientosCount = await MantenimientoProgramado.count({
        where: { plan_actividad_id: id }
      });

      if (mantenimientosCount > 0) {
        return res.status(409).json({
          success: false,
          message: `No se puede eliminar la actividad porque tiene ${mantenimientosCount} mantenimiento(s) programado(s) asociado(s)`
        });
      }

      await actividad.destroy();

      res.status(200).json({
        success: true,
        message: 'Actividad eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar actividad:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar la actividad',
        error: error.message
      });
    }
  },
  async crearMasivo(req, res, next) {
    const transaction = await sequelize.transaction();

    try {
      const {
        equipos_ids, // ✅ Array de IDs de equipos
        plan_id,
        categoria_id,
        tipo_mantenimiento_id,
        nombre,
        descripcion,
        sede_id,
        periodicidad_id,
        responsable_tipo,
        responsable_usuario_id,
        responsable_proveedor_id,
        duracion_estimada_horas,
        costo_estimado,
        observaciones,
        activo
      } = req.body;

      const usuarioId = req.usuario.id;

      // ✅ Validación: equipos_ids debe ser array con al menos 2 elementos
      if (!equipos_ids || !Array.isArray(equipos_ids) || equipos_ids.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos 2 equipos para creación masiva'
        });
      }

      // Validaciones básicas (igual que crear individual)
      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre es requerido'
        });
      }

      if (!plan_id || !categoria_id || !sede_id || !periodicidad_id || !responsable_tipo) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos requeridos deben ser proporcionados'
        });
      }

      // Verificar permisos sobre la categoría
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(categoria_id);
        if (!tieneAcceso) {
          ////await transaction.rollback();
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para crear actividades en esta categoría'
          });
        }
      }

      // Verificar que el plan existe
      const plan = await PlanMantenimiento.findByPk(plan_id);
      if (!plan) {
       // //await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Plan de mantenimiento no encontrado'
        });
      }

      // Verificar que la categoría existe
      const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
      if (!categoria) {
       // //await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar que la sede existe
      const sede = await Sede.findByPk(sede_id);
      if (!sede) {
       // //await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Sede no encontrada'
        });
      }

      // Verificar que la periodicidad existe
      const periodicidad = await Periodicidad.findByPk(periodicidad_id);
      if (!periodicidad) {
       // //await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Periodicidad no encontrada'
        });
      }

      // ✅ Verificar que TODOS los equipos existen y pertenecen a la categoría
      const equipos = await Equipo.findAll({
        where: {
          id: equipos_ids
        }
      });

      if (equipos.length !== equipos_ids.length) {
       // //await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Uno o más equipos no fueron encontrados'
        });
      }

      // Validar que todos los equipos pertenecen a la categoría correcta
      const equiposInvalidos = equipos.filter(e => e.categoria_id !== parseInt(categoria_id));
      if (equiposInvalidos.length > 0) {
       // //await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Los siguientes equipos no pertenecen a la categoría seleccionada: ${equiposInvalidos.map(e => e.codigo).join(', ')}`
        });
      }

      // Validar responsable según tipo
      if (responsable_tipo === 'interno') {
        if (!responsable_usuario_id) {
         // //await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar un responsable usuario para tipo interno'
          });
        }

        const responsable = await Usuario.findByPk(responsable_usuario_id);
        if (!responsable) {
          ////await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'Usuario responsable no encontrado'
          });
        }
      } else if (responsable_tipo === 'externo') {
        if (!responsable_proveedor_id) {
          ////await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Debe proporcionar un proveedor para tipo proveedor'
          });
        }

        const proveedor = await Proveedor.findByPk(responsable_proveedor_id);
        if (!proveedor) {
         // //await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'Proveedor no encontrado'
          });
        }
      }

      // ✅ Generar ID de grupo masivo
      const grupoMasivoId = generarGrupoMasivoId();

      // ✅ Crear una actividad por cada equipo
      const actividadesCreadas = [];

      for (const equipo_id of equipos_ids) {
        const nuevaActividad = await PlanActividad.create({
          plan_id,
          categoria_id,
          tipo_mantenimiento_id,
          nombre,
          descripcion,
          sede_id,
          equipo_id, // ✅ Equipo específico
          periodicidad_id,
          responsable_tipo,
          responsable_usuario_id: responsable_tipo === 'interno' ? responsable_usuario_id : null,
          responsable_proveedor_id: responsable_tipo === 'externo' ? responsable_proveedor_id : null,
          duracion_estimada_horas,
          costo_estimado,
          observaciones,
          activo: activo !== undefined ? activo : true,
          grupo_masivo_id: grupoMasivoId // ✅ Mismo grupo para todas
        }, { transaction });

        actividadesCreadas.push(nuevaActividad);
      }

      await transaction.commit();

      // ✅ Obtener las actividades creadas con sus relaciones
      const actividadesCompletas = await PlanActividad.findAll({
        where: {
          grupo_masivo_id: grupoMasivoId
        },
        include: [
          {
            model: PlanMantenimiento,
            as: 'plan',
            attributes: ['id', 'nombre', 'anio']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'color']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'nombre']
          },
          {
            model: Equipo,
            as: 'equipo',
            attributes: ['id', 'codigo', 'nombre']
          },
          {
            model: Periodicidad,
            as: 'periodicidad',
            attributes: ['id', 'nombre', 'dias']
          },
          {
            model: Usuario,
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'apellido']
          },
          {
            model: Proveedor,
            as: 'responsable_proveedor',
            attributes: ['id', 'nombre']
          }
        ],
        order: [['id', 'ASC']]
      });

      res.status(201).json({
        success: true,
        message: `${actividadesCreadas.length} actividades creadas exitosamente en grupo ${grupoMasivoId}`,
        grupo_masivo_id: grupoMasivoId,
        cantidad: actividadesCreadas.length,
        data: actividadesCompletas
      });

    } catch (error) {
     // //await transaction.rollback();
      console.error('Error al crear actividades masivamente:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear las actividades',
        error: error.message
      });
    }

  },
  /**
 * Obtener todas las actividades de un grupo masivo
 */
async obtenerPorGrupo(req, res, next) {
  try {
    const { grupo_masivo_id } = req.params;
    const usuarioId = req.usuario.id;

    const actividades = await PlanActividad.findAll({
      where: { grupo_masivo_id },
      include: [
        {
          model: PlanMantenimiento,
          as: 'plan',
          attributes: ['id', 'nombre', 'anio']
        },
        {
          model: CategoriaMantenimiento,
          as: 'categoria',
          attributes: ['id', 'nombre', 'color']
        },
        {
          model: Sede,
          as: 'sede',
          attributes: ['id', 'nombre']
        },
        {
          model: Equipo,
          as: 'equipo',
          attributes: ['id', 'codigo', 'nombre']
        },
        {
          model: Periodicidad,
          as: 'periodicidad',
          attributes: ['id', 'nombre', 'dias']
        },
        {
          model: Usuario,
          as: 'responsable_usuario',
          attributes: ['id', 'nombre', 'apellido']
        },
        {
          model: Proveedor,
          as: 'responsable_proveedor',
          attributes: ['id', 'nombre']
        }
      ],
      order: [['id', 'ASC']]
    });

    if (actividades.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron actividades con ese grupo_masivo_id'
      });
    }

    // Verificar permisos sobre la primera actividad (todas tienen la misma categoría)
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario.es_super_admin) {
      const tieneAcceso = await usuario.tieneAccesoCategoria(actividades[0].categoria_id);
      if (!tieneAcceso) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para ver estas actividades'
        });
      }
    }

    res.json({
      success: true,
      grupo_masivo_id,
      cantidad: actividades.length,
      data: actividades
    });

  } catch (error) {
    console.error('Error al obtener actividades del grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las actividades del grupo',
      error: error.message
    });
  }
},

/**
 * Actualizar todas las actividades de un grupo masivo
 */
async actualizarGrupo(req, res, next) {
  const transaction = await sequelize.transaction();
  
  try {
    const { grupo_masivo_id } = req.params;
    const datosActualizacion = req.body;
    const usuarioId = req.usuario.id;

    // Validar que el grupo existe
    const actividades = await PlanActividad.findAll({
      where: { grupo_masivo_id }
    });

    if (actividades.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron actividades con ese grupo_masivo_id'
      });
    }

    // Verificar permisos
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario.es_super_admin) {
      const tieneAcceso = await usuario.tieneAccesoCategoria(actividades[0].categoria_id);
      if (!tieneAcceso) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para modificar estas actividades'
        });
      }

      // Si está cambiando de categoría, verificar permisos en la nueva
      if (datosActualizacion.categoria_id && 
          datosActualizacion.categoria_id !== actividades[0].categoria_id) {
        const tieneAccesoNuevaCategoria = await usuario.tieneAccesoCategoria(datosActualizacion.categoria_id);
        if (!tieneAccesoNuevaCategoria) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para mover las actividades a esa categoría'
          });
        }
      }
    }

    // Campos que NO se pueden actualizar masivamente (por seguridad)
    const camposProhibidos = ['id', 'plan_id', 'equipo_id', 'grupo_masivo_id', 'created_at', 'updated_at'];
    camposProhibidos.forEach(campo => delete datosActualizacion[campo]);

    // Validar recursos si se están actualizando
    if (datosActualizacion.categoria_id) {
      const categoria = await CategoriaMantenimiento.findByPk(datosActualizacion.categoria_id);
      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }
    }

    if (datosActualizacion.sede_id) {
      const sede = await Sede.findByPk(datosActualizacion.sede_id);
      if (!sede) {
        return res.status(404).json({
          success: false,
          message: 'Sede no encontrada'
        });
      }
    }

    if (datosActualizacion.periodicidad_id) {
      const periodicidad = await Periodicidad.findByPk(datosActualizacion.periodicidad_id);
      if (!periodicidad) {
        return res.status(404).json({
          success: false,
          message: 'Periodicidad no encontrada'
        });
      }
    }

    if (datosActualizacion.responsable_tipo === 'interno' && datosActualizacion.responsable_usuario_id) {
      const responsable = await Usuario.findByPk(datosActualizacion.responsable_usuario_id);
      if (!responsable) {
        return res.status(404).json({
          success: false,
          message: 'Usuario responsable no encontrado'
        });
      }
      datosActualizacion.responsable_proveedor_id = null;
    } else if (datosActualizacion.responsable_tipo === 'externo' && datosActualizacion.responsable_proveedor_id) {
      const proveedor = await Proveedor.findByPk(datosActualizacion.responsable_proveedor_id);
      if (!proveedor) {
        return res.status(404).json({
          success: false,
          message: 'Proveedor no encontrado'
        });
      }
      datosActualizacion.responsable_usuario_id = null;
    }

    // Actualizar todas las actividades del grupo
    const [cantidadActualizada] = await PlanActividad.update(
      datosActualizacion,
      { 
        where: { grupo_masivo_id },
        transaction 
      }
    );

    await transaction.commit();

    // Obtener actividades actualizadas
    const actividadesActualizadas = await PlanActividad.findAll({
      where: { grupo_masivo_id },
      include: [
        {
          model: PlanMantenimiento,
          as: 'plan',
          attributes: ['id', 'nombre', 'anio']
        },
        {
          model: CategoriaMantenimiento,
          as: 'categoria',
          attributes: ['id', 'nombre', 'color']
        },
        {
          model: Sede,
          as: 'sede',
          attributes: ['id', 'nombre']
        },
        {
          model: Equipo,
          as: 'equipo',
          attributes: ['id', 'codigo', 'nombre']
        },
        {
          model: Periodicidad,
          as: 'periodicidad',
          attributes: ['id', 'nombre', 'dias']
        },
        {
          model: Usuario,
          as: 'responsable_usuario',
          attributes: ['id', 'nombre', 'apellido']
        },
        {
          model: Proveedor,
          as: 'responsable_proveedor',
          attributes: ['id', 'nombre']
        }
      ],
      order: [['id', 'ASC']]
    });

    res.json({
      success: true,
      message: `${cantidadActualizada} actividades actualizadas en el grupo ${grupo_masivo_id}`,
      grupo_masivo_id,
      cantidad_actualizada: cantidadActualizada,
      data: actividadesActualizadas
    });

  } catch (error) {
    //await transaction.rollback();
    console.error('Error al actualizar grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el grupo de actividades',
      error: error.message
    });
  }
},

/**
 * Eliminar todas las actividades de un grupo masivo
 */
async eliminarGrupo(req, res, next) {
  const transaction = await sequelize.transaction();
  
  try {
    const { grupo_masivo_id } = req.params;
    const usuarioId = req.usuario.id;

    // Validar que el grupo existe
    const actividades = await PlanActividad.findAll({
      where: { grupo_masivo_id }
    });

    if (actividades.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron actividades con ese grupo_masivo_id'
      });
    }

    // Verificar permisos
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario.es_super_admin) {
      const tieneAcceso = await usuario.tieneAccesoCategoria(actividades[0].categoria_id);
      if (!tieneAcceso) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permiso para eliminar estas actividades'
        });
      }
    }

    // Verificar si alguna actividad tiene mantenimientos programados
    const actividadesConMantenimientos = [];
    for (const actividad of actividades) {
      const count = await MantenimientoProgramado.count({
        where: { plan_actividad_id: actividad.id }
      });
      if (count > 0) {
        actividadesConMantenimientos.push({
          id: actividad.id,
          nombre: actividad.nombre,
          mantenimientos: count
        });
      }
    }

    if (actividadesConMantenimientos.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar el grupo porque algunas actividades tienen mantenimientos programados',
        actividades_bloqueadas: actividadesConMantenimientos
      });
    }

    // Eliminar todas las actividades del grupo
    const cantidad = await PlanActividad.destroy({
      where: { grupo_masivo_id },
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      message: `${cantidad} actividades eliminadas del grupo ${grupo_masivo_id}`,
      cantidad_eliminada: cantidad
    });

  } catch (error) {
    //await transaction.rollback();
    console.error('Error al eliminar grupo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el grupo de actividades',
      error: error.message
    });
  }
}

};

module.exports = planActividadController;