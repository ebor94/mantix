// ============================================
// src/controllers/categoriaMantenimientoController.js
// ============================================
const { CategoriaMantenimiento, Usuario, UsuarioCategoria, Equipo, Rol } = require('../models');
const { Op } = require('sequelize');

const categoriaMantenimientoController = {
  // Obtener todas las categorías (filtradas por permisos del usuario)
  async obtenerTodas(req, res, next) {
    try {
      const { activo } = req.query;
      const usuarioId = req.usuario.id;

      // Verificar que el usuario existe
      const usuario = await Usuario.findByPk(usuarioId);
      
      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      let categorias;

      // Si es super admin, traer todas las categorías
      if (usuario.es_super_admin) {
        const whereCondition = activo !== undefined ? { activo: activo === 'true' } : {};
        
        categorias = await CategoriaMantenimiento.findAll({
          where: whereCondition,
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono', 'activo', 'created_at', 'updated_at'],
          order: [['nombre', 'ASC']]
        });
      } else {
        // Si NO es super admin, traer solo las categorías asignadas
        const whereCondition = activo !== undefined ? { activo: activo === 'true' } : { activo: true };

        categorias = await CategoriaMantenimiento.findAll({
          where: whereCondition,
          include: [{
            model: UsuarioCategoria,
            as: 'usuario_categorias',
            where: { usuario_id: usuarioId },
            required: true,
            attributes: []
          }],
          attributes: ['id', 'nombre', 'descripcion', 'color', 'icono', 'activo', 'created_at', 'updated_at'],
          order: [['nombre', 'ASC']]
        });
      }

      res.status(200).json({
        success: true,
        data: categorias
      });
    } catch (error) {
      console.error('Error al obtener categorías:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las categorías de mantenimiento',
        error: error.message
      });
    }
  },

  // Obtener categoría por ID (con verificación de permisos)
  async obtenerPorId(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const categoria = await CategoriaMantenimiento.findByPk(id, {
        attributes: ['id', 'nombre', 'descripcion', 'color', 'icono', 'activo', 'created_at', 'updated_at']
      });

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar permisos si no es super admin
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(parseInt(id));
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para ver esta categoría'
          });
        }
      }

      res.status(200).json({
        success: true,
        data: categoria
      });
    } catch (error) {
      console.error('Error al obtener categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener la categoría',
        error: error.message
      });
    }
  },

  // Crear nueva categoría (solo super admin)
  async crear(req, res, next) {
    try {
      const { nombre, descripcion, color, icono } = req.body;

      if (!nombre) {
        return res.status(400).json({
          success: false,
          message: 'El nombre es requerido'
        });
      }

      // Verificar si ya existe una categoría con ese nombre
      const categoriaExistente = await CategoriaMantenimiento.findOne({
        where: { nombre }
      });

      if (categoriaExistente) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una categoría con ese nombre'
        });
      }

      const nuevaCategoria = await CategoriaMantenimiento.create({
        nombre,
        descripcion,
        color: color || '#667eea',
        icono: icono || 'mdi-cog',
        activo: true
      });

      res.status(201).json({
        success: true,
        message: 'Categoría creada exitosamente',
        data: nuevaCategoria
      });
    } catch (error) {
      console.error('Error al crear categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al crear la categoría',
        error: error.message
      });
    }
  },

  // Actualizar categoría (solo super admin)
  async actualizar(req, res, next) {
    try {
      const { id } = req.params;
      const { nombre, descripcion, color, icono, activo } = req.body;

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Si se está cambiando el nombre, verificar que no exista otra con ese nombre
      if (nombre && nombre !== categoria.nombre) {
        const categoriaExistente = await CategoriaMantenimiento.findOne({
          where: { 
            nombre,
            id: { [Op.ne]: id }
          }
        });

        if (categoriaExistente) {
          return res.status(409).json({
            success: false,
            message: 'Ya existe otra categoría con ese nombre'
          });
        }
      }

      const datosActualizacion = {};
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (descripcion !== undefined) datosActualizacion.descripcion = descripcion;
      if (color !== undefined) datosActualizacion.color = color;
      if (icono !== undefined) datosActualizacion.icono = icono;
      if (activo !== undefined) datosActualizacion.activo = activo;

      await categoria.update(datosActualizacion);

      res.status(200).json({
        success: true,
        message: 'Categoría actualizada exitosamente',
        data: categoria
      });
    } catch (error) {
      console.error('Error al actualizar categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar la categoría',
        error: error.message
      });
    }
  },

  // Toggle activo/inactivo (solo super admin)
  async toggleActivo(req, res, next) {
    try {
      const { id } = req.params;

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      await categoria.update({ activo: !categoria.activo });

      res.status(200).json({
        success: true,
        message: `Categoría ${categoria.activo ? 'activada' : 'desactivada'} exitosamente`,
        data: categoria
      });
    } catch (error) {
      console.error('Error al cambiar estado de categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al cambiar el estado de la categoría',
        error: error.message
      });
    }
  },

  // Eliminar categoría - Soft delete (solo super admin)
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Soft delete - solo desactivar
      await categoria.update({ activo: false });

      res.status(200).json({
        success: true,
        message: 'Categoría desactivada exitosamente'
      });
    } catch (error) {
      console.error('Error al desactivar categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al desactivar la categoría',
        error: error.message
      });
    }
  },

  // Eliminar permanentemente (solo super admin)
  async eliminarPermanente(req, res, next) {
    try {
      const { id } = req.params;

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar si hay equipos asociados
      const equiposCount = await Equipo.count({
        where: { categoria_id: id }
      });

      if (equiposCount > 0) {
        return res.status(400).json({
          success: false,
          message: `No se puede eliminar la categoría porque tiene ${equiposCount} equipo(s) asociado(s)`
        });
      }

      // Eliminar relaciones de usuarios primero
      await UsuarioCategoria.destroy({
        where: { categoria_id: id }
      });

      // Eliminar permanentemente
      await categoria.destroy();

      res.status(200).json({
        success: true,
        message: 'Categoría eliminada permanentemente'
      });
    } catch (error) {
      console.error('Error al eliminar categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar la categoría',
        error: error.message
      });
    }
  },

  // Asignar usuarios a una categoría (solo super admin)
  async asignarUsuarios(req, res, next) {
    try {
      const { id } = req.params;
      const { usuarios_ids } = req.body;

      if (!Array.isArray(usuarios_ids) || usuarios_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar un array de IDs de usuarios'
        });
      }

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar que todos los usuarios existen
      const usuarios = await Usuario.findAll({
        where: { id: { [Op.in]: usuarios_ids } }
      });

      if (usuarios.length !== usuarios_ids.length) {
        return res.status(400).json({
          success: false,
          message: 'Algunos usuarios no existen'
        });
      }

      // Eliminar asignaciones existentes
      await UsuarioCategoria.destroy({
        where: { categoria_id: id }
      });

      // Crear nuevas asignaciones
      const asignaciones = usuarios_ids.map(usuario_id => ({
        usuario_id,
        categoria_id: parseInt(id)
      }));

      await UsuarioCategoria.bulkCreate(asignaciones);

      res.status(200).json({
        success: true,
        message: `Se asignaron ${usuarios_ids.length} usuario(s) a la categoría`,
        data: {
          categoria_id: parseInt(id),
          usuarios_asignados: usuarios_ids.length
        }
      });
    } catch (error) {
      console.error('Error al asignar usuarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error al asignar usuarios a la categoría',
        error: error.message
      });
    }
  },

  // Obtener usuarios asignados a una categoría
  async obtenerUsuariosAsignados(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const categoria = await CategoriaMantenimiento.findByPk(id);

      if (!categoria) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar permisos si no es super admin
      const usuario = await Usuario.findByPk(usuarioId);
      if (!usuario.es_super_admin) {
        const tieneAcceso = await usuario.tieneAccesoCategoria(parseInt(id));
        if (!tieneAcceso) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permiso para ver esta categoría'
          });
        }
      }

      const usuariosAsignados = await UsuarioCategoria.findAll({
        where: { categoria_id: id },
        include: [{
          model: Usuario,
          as: 'usuario',
          attributes: ['id', 'nombre', 'apellido', 'email', 'activo'],
          include: [{
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre']
          }]
        }]
      });

      res.status(200).json({
        success: true,
        data: usuariosAsignados.map(uc => uc.usuario)
      });
    } catch (error) {
      console.error('Error al obtener usuarios asignados:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener usuarios asignados',
        error: error.message
      });
    }
  }
};

module.exports = categoriaMantenimientoController;