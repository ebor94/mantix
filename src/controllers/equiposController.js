// ============================================
// src/controllers/equiposController.js
// ============================================
const { Equipo, CategoriaMantenimiento, Sede, Usuario, Rol, UsuarioCategoria, Proveedor } = require('../models');
const { MantenimientoProgramado, PlanActividad, Estado, MantenimientoEjecutado } = require('../models');
const { Op } = require('sequelize');

const equiposController = {
  // Get all equipos (FILTRADO POR CATEGORÍAS DEL USUARIO)
  async getAll(req, res, next) {
    try {
      const usuarioId = req.usuario.id;
      const usuario = await Usuario.findByPk(usuarioId);

      let whereCondition = { activo: true };

      // Si NO es super admin, filtrar por categorías permitidas
      if (!usuario.es_super_admin) {
        // Obtener las categorías a las que tiene acceso el usuario
        const usuarioCategorias = await UsuarioCategoria.findAll({
          where: { usuario_id: usuarioId },
          attributes: ['categoria_id']
        });

        const categoriasIds = usuarioCategorias.map(uc => uc.categoria_id);

        if (categoriasIds.length === 0) {
          // Si no tiene categorías asignadas, devolver array vacío
          return res.status(200).json([]);
        }

        // Filtrar equipos solo de las categorías permitidas
        whereCondition.categoria_id = {
          [Op.in]: categoriasIds
        };
      }

      const equipos = await Equipo.findAll({
        where: whereCondition,
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ],
        order: [['codigo', 'ASC']]
      });

      res.status(200).json(equipos);
    } catch (error) {
      next(error);
    }
  },

  // Get equipo by ID (CON VERIFICACIÓN DE PERMISOS)
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const equipo = await Equipo.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad', 'direccion']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email', 'telefono'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      // Verificar permisos (ya se hace en el middleware requireEquipoAccess, pero por si acaso)
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(equipo.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({ 
            error: 'No tienes permiso para ver este equipo' 
          });
        }
      }

      res.status(200).json(equipo);
    } catch (error) {
      next(error);
    }
  },

  // Create equipo (CON VERIFICACIÓN DE PERMISOS)
  async create(req, res, next) {
    try {
      const {
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado,
        observaciones,
        activo
      } = req.body;

      const usuarioId = req.usuario.id;

      // Verificar que el usuario tenga acceso a la categoría donde quiere crear el equipo
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({ 
            error: 'No tienes permiso para crear equipos en esta categoría' 
          });
        }
      }

      // Verificar si el código ya existe
      const codigoExistente = await Equipo.findOne({ where: { codigo } });
      if (codigoExistente) {
        return res.status(409).json({ 
          error: 'El código de equipo ya está registrado' 
        });
      }

      // Verificar si la categoría existe
      const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
      if (!categoria) {
        return res.status(400).json({ 
          error: 'La categoría especificada no existe' 
        });
      }

      // Verificar si la sede existe
      const sede = await Sede.findByPk(sede_id);
      if (!sede) {
        return res.status(400).json({ 
          error: 'La sede especificada no existe' 
        });
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Crear el equipo
      const nuevoEquipo = await Equipo.create({
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado: estado || 'operativo',
        observaciones,
        activo: activo !== undefined ? activo : true
      });

      // Obtener el equipo creado con todas sus relaciones
      const equipoCreado = await Equipo.findByPk(nuevoEquipo.id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      res.status(201).json(equipoCreado);
    } catch (error) {
      next(error);
    }
  },

  // Update equipo (CON VERIFICACIÓN DE PERMISOS)
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const {
        codigo,
        nombre,
        categoria_id,
        sede_id,
        marca,
        modelo,
        numero_serie,
        ubicacion_especifica,
        fecha_instalacion,
        fecha_compra,
        valor_compra,
        vida_util_anos,
        responsable_id,
        estado,
        observaciones,
        activo
      } = req.body;

      const usuarioId = req.usuario.id;

      // Verificar si el equipo existe
      const equipo = await Equipo.findByPk(id);
      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      // Verificar permisos sobre el equipo actual
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(equipo.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({ 
            error: 'No tienes permiso para editar este equipo' 
          });
        }

        // Si está cambiando de categoría, verificar permisos en la nueva categoría
        if (categoria_id && categoria_id !== equipo.categoria_id) {
          const tieneAccesoNuevaCategoria = await usuario.tieneAccesoCategoria(categoria_id);
          if (!tieneAccesoNuevaCategoria) {
            return res.status(403).json({ 
              error: 'No tienes permiso para mover el equipo a esa categoría' 
            });
          }
        }
      }

      // Si se está actualizando el código, verificar que no esté en uso
      if (codigo && codigo !== equipo.codigo) {
        const codigoExistente = await Equipo.findOne({ 
          where: { 
            codigo,
            id: { [Op.ne]: id }
          } 
        });
        
        if (codigoExistente) {
          return res.status(409).json({ 
            error: 'El código de equipo ya está registrado en otro equipo' 
          });
        }
      }

      // Verificar si la categoría existe (si se proporciona)
      if (categoria_id) {
        const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
        if (!categoria) {
          return res.status(400).json({ 
            error: 'La categoría especificada no existe' 
          });
        }
      }

      // Verificar si la sede existe (si se proporciona)
      if (sede_id) {
        const sede = await Sede.findByPk(sede_id);
        if (!sede) {
          return res.status(400).json({ 
            error: 'La sede especificada no existe' 
          });
        }
      }

      // Verificar si el responsable existe (si se proporciona)
      if (responsable_id) {
        const responsable = await Usuario.findByPk(responsable_id);
        if (!responsable) {
          return res.status(400).json({ 
            error: 'El responsable especificado no existe' 
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      if (codigo !== undefined) datosActualizacion.codigo = codigo;
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (categoria_id !== undefined) datosActualizacion.categoria_id = categoria_id;
      if (sede_id !== undefined) datosActualizacion.sede_id = sede_id;
      if (marca !== undefined) datosActualizacion.marca = marca;
      if (modelo !== undefined) datosActualizacion.modelo = modelo;
      if (numero_serie !== undefined) datosActualizacion.numero_serie = numero_serie;
      if (ubicacion_especifica !== undefined) datosActualizacion.ubicacion_especifica = ubicacion_especifica;
      if (fecha_instalacion !== undefined) datosActualizacion.fecha_instalacion = fecha_instalacion;
      if (fecha_compra !== undefined) datosActualizacion.fecha_compra = fecha_compra;
      if (valor_compra !== undefined) datosActualizacion.valor_compra = valor_compra;
      if (vida_util_anos !== undefined) datosActualizacion.vida_util_anos = vida_util_anos;
      if (responsable_id !== undefined) datosActualizacion.responsable_id = responsable_id;
      if (estado !== undefined) datosActualizacion.estado = estado;
      if (observaciones !== undefined) datosActualizacion.observaciones = observaciones;
      if (activo !== undefined) datosActualizacion.activo = activo;

      // Actualizar equipo
      await equipo.update(datosActualizacion);

      // Obtener equipo actualizado con todas sus relaciones
      const equipoActualizado = await Equipo.findByPk(id, {
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ]
      });

      res.status(200).json(equipoActualizado);
    } catch (error) {
      next(error);
    }
  },

  // Delete equipo (CON VERIFICACIÓN DE PERMISOS)
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      // Verificar si el equipo existe
      const equipo = await Equipo.findByPk(id);
      if (!equipo) {
        return res.status(404).json({ 
          error: 'Equipo no encontrado' 
        });
      }

      // Verificar permisos
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(equipo.categoria_id);
        if (!tieneAcceso) {
          return res.status(403).json({ 
            error: 'No tienes permiso para eliminar este equipo' 
          });
        }
      }

      // Validar si tiene mantenimientos
      const mantenimientos = await equipo.countMantenimientos();
      if (mantenimientos > 0) {
        return res.status(400).json({ 
          error: `No se puede eliminar el equipo porque tiene ${mantenimientos} registro(s) de mantenimiento` 
        });
      }

      // Eliminar el equipo
      await equipo.destroy();

      res.status(200).json({ 
        message: 'Equipo eliminado exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener equipos por categoría
  async getByCategoriaId(req, res, next) {
    try {
      const { categoriaId } = req.params;
      const usuarioId = req.usuario.id;

      // Verificar si el usuario tiene acceso a esta categoría
      const usuario = await Usuario.findByPk(usuarioId);
      
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(parseInt(categoriaId));
        if (!tieneAcceso) {
          return res.status(403).json({ 
            error: 'No tienes permiso para ver equipos de esta categoría' 
          });
        }
      }

      const equipos = await Equipo.findAll({
        where: { 
          categoria_id: categoriaId,
          activo: true 
        },
        include: [
          {
            model: CategoriaMantenimiento,
            as: 'categoria',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono']
          },
          {
            model: Sede,
            as: 'sede',
            attributes: ['id', 'codigo', 'nombre', 'ciudad']
          },
          {
            model: Usuario,
            as: 'responsable',
            attributes: ['id', 'nombre', 'apellido', 'email'],
            include: [{
              model: Rol,
              as: 'rol',
              attributes: ['nombre']
            }]
          }
        ],
        order: [['codigo', 'ASC']]
      });

      res.status(200).json(equipos);
    } catch (error) {
      next(error);
    }
  },


  async historialMantenimientoEquipo(req, res, next) {
      try {
    const { equipoId } = req.params;
    const {            
      desde, 
      hasta, 
      limite = 50, 
      pagina = 1 
    } = req.query;

    // Construir filtros dinámicos
    const whereClause = {};

 
    
    if (desde && hasta) {
      whereClause.fecha_programada = { 
        [Op.between]: [desde, hasta] 
      };
    } else if (desde) {
      whereClause.fecha_programada = { [Op.gte]: desde };
    } else if (hasta) {
      whereClause.fecha_programada = { [Op.lte]: hasta };
    }

    // Filtros para plan_actividad
    const actividadWhere = { equipo_id: equipoId };
    //if (categoria) actividadWhere.categoria_id = categoria;
   // if (tipoMantenimiento) actividadWhere.tipo_mantenimiento_id = tipoMantenimiento;

    const offset = (pagina - 1) * limite;

    const historial = await MantenimientoProgramado.findAndCountAll({
      include: [
        {
          model: PlanActividad,
          as: 'actividad',
          where: actividadWhere,
          include: [
            {
              model: Equipo,
              as: 'equipo',
              attributes: ['id', 'codigo', 'nombre', 'ubicacion_especifica', 'marca', 'modelo']
            },     
      
      
            {
              model: Usuario,
              as: 'responsable_usuario',
              attributes: ['id', 'nombre', 'email'],
              required: false
            },
            {
              model: Proveedor,
              as: 'responsable_proveedor',
              attributes: ['id', 'nombre'],
              required: false
            },
            {
              model: Sede,
              as: 'sede',
              attributes: ['id', 'nombre', 'direccion']
            }
          ]
        },
        {
          model: Estado,
          as: 'estado',
          attributes: ['id', 'nombre', 'color', 'tipo']
        },
        {
          model: MantenimientoEjecutado,
          as: 'ejecucion',
          required: false,
          attributes: [
            'id', 
            'fecha_ejecucion', 
            'hora_inicio',
            'hora_fin',
            'duracion_horas', 
            'nombre_recibe',
            'ejecutado_por_proveedor_id', 
            'ejecutado_por_usuario_id',
            'observaciones',
            'costo_real'
          ]
        }
      ],
      where: whereClause,
      order: [['fecha_programada', 'DESC']],
      limit: parseInt(limite),
      offset: offset,
      distinct: true // Importante para el count correcto con joins
    });

    // Calcular estadísticas del historial
    const estadisticas = {
      total_mantenimientos: historial.count,
      completados: historial.rows.filter(m => m.estado?.nombre === 'Completado').length,
      pendientes: historial.rows.filter(m => m.estado?.nombre === 'Pendiente').length,
      reprogramados: historial.rows.filter(m => m.reprogramaciones > 0).length
    };

    res.json({
      success: true,
      data: {
        equipo_id: parseInt(equipoId),
        estadisticas,
        paginacion: {
          total: historial.count,
          pagina_actual: parseInt(pagina),
          total_paginas: Math.ceil(historial.count / limite),
          limite: parseInt(limite)
        },
        mantenimientos: historial.rows
      }
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el historial de mantenimientos',
      error: error.message
    });
  }

    },

  async ResumenMantenimientos(req, res, next) {   
    try {
    const { equipoId } = req.params;

    const resumen = await MantenimientoProgramado.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('MantenimientoProgramado.id')), 'total'],
        [sequelize.fn('AVG', sequelize.col('ejecucion.duracion_real')), 'duracion_promedio'],
        [sequelize.fn('SUM', sequelize.col('ejecucion.costo_real')), 'costo_total']
      ],
      include: [
        {
          model: PlanActividad,
          as: 'actividad',
          where: { equipo_id: equipoId },
          attributes: []
        },
        {
          model: MantenimientoEjecutado,
          as: 'ejecucion',
          required: false,
          attributes: []
        }
      ],
      raw: true
    });

    res.json({
      success: true,
      data: {
        equipo_id: parseInt(equipoId),
        resumen: resumen[0]
      }
    });

  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el resumen de mantenimientos',
      error: error.message
    });
  }
  }
};

module.exports = equiposController;