// Usuarios controller
const { Usuario, Rol, UsuarioCategoria, CategoriaMantenimiento } = require('../models');
const { Op } = require('sequelize');

const usuariosController = {
  // Get all users
  async getAll(req, res, next) {
    try {
      const usuarioActual = req.usuario;

      // Solo super admin puede ver todos los usuarios
      if (!usuarioActual.es_super_admin) {
        return res.status(403).json({ 
          error: 'No tienes permiso para ver la lista de usuarios' 
        });
      }

      // Obtenemos todos los usuarios con sus roles y categorías
      const usuarios = await Usuario.findAll({
        include: [
          {
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categorias_permitidas',
            attributes: ['id', 'nombre', 'color', 'icono'],
            through: { attributes: [] } // No incluir los atributos de la tabla intermedia
          }
        ],
        order: [['nombre', 'ASC']]
      });

      res.status(200).json(usuarios);
    } catch (error) {
      next(error);
    }
  },

  // Get user by ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioActual = req.usuario;

      // Un usuario puede ver su propio perfil, o el super admin puede ver cualquiera
      if (!usuarioActual.es_super_admin && usuarioActual.id !== parseInt(id)) {
        return res.status(403).json({ 
          error: 'No tienes permiso para ver este usuario' 
        });
      }

      const usuario = await Usuario.findByPk(id, {
        include: [
          {
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categorias_permitidas',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
            through: { 
              attributes: ['created_at'],
              as: 'asignacion'
            }
          }
        ]
      });

      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      res.status(200).json(usuario);
    } catch (error) {
      next(error);
    }
  },

  // Get current user profile
  async getProfile(req, res, next) {
    try {
      const usuarioId = req.usuario.id;

      const usuario = await Usuario.findByPk(usuarioId, {
        include: [
          {
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre', 'descripcion']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categorias_permitidas',
            attributes: ['id', 'nombre', 'descripcion', 'color', 'icono'],
            through: { 
              attributes: ['created_at'],
              as: 'asignacion'
            }
          }
        ]
      });

      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      res.status(200).json(usuario);
    } catch (error) {
      next(error);
    }
  },

  // Create user
  async create(req, res, next) {
    try {
      const usuarioActual = req.usuario;
      const { 
        rol_id, 
        nombre, 
        apellido, 
        email, 
        password, 
        telefono, 
        avatar, 
        es_super_admin,
        categorias // Array de IDs de categorías
      } = req.body;

      // Solo super admin puede crear usuarios
      if (!usuarioActual.es_super_admin) {
        return res.status(403).json({ 
          error: 'No tienes permiso para crear usuarios' 
        });
      }

      // Validar que el rol existe
      const rol = await Rol.findByPk(rol_id);
      if (!rol) {
        return res.status(400).json({ 
          error: 'El rol especificado no existe' 
        });
      }

      // Crear el usuario
      const nuevoUsuario = await Usuario.create({
        rol_id,
        nombre,
        apellido,
        email,
        password,
        telefono,
        avatar,
        es_super_admin: es_super_admin || false
      });

      // Si se proporcionaron categorías, asignarlas
      if (categorias && Array.isArray(categorias) && categorias.length > 0) {
        // Validar que todas las categorías existen
        const categoriasExistentes = await CategoriaMantenimiento.findAll({
          where: { id: categorias }
        });

        if (categoriasExistentes.length !== categorias.length) {
          return res.status(400).json({ 
            error: 'Una o más categorías especificadas no existen' 
          });
        }

        // Asignar las categorías al usuario
        const asignaciones = categorias.map(categoria_id => ({
          usuario_id: nuevoUsuario.id,
          categoria_id
        }));

        await UsuarioCategoria.bulkCreate(asignaciones);
      }

      // Obtener el usuario creado con todas sus relaciones
      const usuarioCreado = await Usuario.findByPk(nuevoUsuario.id, {
        include: [
          {
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categorias_permitidas',
            attributes: ['id', 'nombre', 'color', 'icono'],
            through: { attributes: [] }
          }
        ]
      });

      res.status(201).json(usuarioCreado);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ 
          error: 'El correo electrónico ya está registrado.' 
        });
      }
      if (error.name === 'SequelizeValidationError') {
        const errores = error.errors.map(err => ({ 
          campo: err.path, 
          mensaje: err.message 
        }));
        return res.status(400).json({ 
          error: 'Error de validación', 
          errores 
        });
      }
      next(error);
    }
  },

  // Update user
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioActual = req.usuario;
      const { 
        rol_id, 
        nombre, 
        apellido, 
        email, 
        password, 
        telefono, 
        avatar, 
        activo,
        es_super_admin,
        categorias // Array de IDs de categorías
      } = req.body;

      // Verificar si el usuario existe
      const usuario = await Usuario.findByPk(id);
      
      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      // Un usuario puede actualizar su propio perfil (campos limitados)
      // O el super admin puede actualizar cualquier usuario
      const esSuPropio = usuarioActual.id === parseInt(id);
      
      if (!usuarioActual.es_super_admin && !esSuPropio) {
        return res.status(403).json({ 
          error: 'No tienes permiso para actualizar este usuario' 
        });
      }

      // Si no es super admin, no puede cambiar ciertos campos
      if (!usuarioActual.es_super_admin) {
        if (rol_id !== undefined || es_super_admin !== undefined || activo !== undefined || categorias !== undefined) {
          return res.status(403).json({ 
            error: 'No tienes permiso para modificar rol, estado de super admin, estado activo o categorías' 
          });
        }
      }

      // Si se está actualizando el email, verificar que no esté en uso
      if (email && email !== usuario.email) {
        const emailExistente = await Usuario.findOne({ 
          where: { 
            email,
            id: { [Op.ne]: id }
          } 
        });
        
        if (emailExistente) {
          return res.status(409).json({ 
            error: 'El email ya está registrado por otro usuario' 
          });
        }
      }

      // Si se proporciona rol_id, verificar que el rol existe
      if (rol_id) {
        const rol = await Rol.findByPk(rol_id);
        if (!rol) {
          return res.status(400).json({ 
            error: 'El rol especificado no existe' 
          });
        }
      }

      // Preparar datos para actualizar
      const datosActualizacion = {};
      
      if (rol_id !== undefined) datosActualizacion.rol_id = rol_id;
      if (nombre !== undefined) datosActualizacion.nombre = nombre;
      if (apellido !== undefined) datosActualizacion.apellido = apellido;
      if (email !== undefined) datosActualizacion.email = email;
      if (password !== undefined) datosActualizacion.password = password;
      if (telefono !== undefined) datosActualizacion.telefono = telefono;
      if (avatar !== undefined) datosActualizacion.avatar = avatar;
      if (activo !== undefined) datosActualizacion.activo = activo;
      if (es_super_admin !== undefined) datosActualizacion.es_super_admin = es_super_admin;

      // Actualizar usuario
      await usuario.update(datosActualizacion);

      // Si el super admin está actualizando las categorías
      if (usuarioActual.es_super_admin && categorias !== undefined) {
        if (Array.isArray(categorias)) {
          // Eliminar todas las asignaciones actuales
          await UsuarioCategoria.destroy({
            where: { usuario_id: id }
          });

          // Si hay categorías nuevas, asignarlas
          if (categorias.length > 0) {
            // Validar que todas las categorías existen
            const categoriasExistentes = await CategoriaMantenimiento.findAll({
              where: { id: categorias }
            });

            if (categoriasExistentes.length !== categorias.length) {
              return res.status(400).json({ 
                error: 'Una o más categorías especificadas no existen' 
              });
            }

            // Crear las nuevas asignaciones
            const asignaciones = categorias.map(categoria_id => ({
              usuario_id: id,
              categoria_id
            }));

            await UsuarioCategoria.bulkCreate(asignaciones);
          }
        }
      }

      // Obtener usuario actualizado con sus relaciones
      const usuarioActualizado = await Usuario.findByPk(id, {
        include: [
          {
            model: Rol,
            as: 'rol',
            attributes: ['id', 'nombre']
          },
          {
            model: CategoriaMantenimiento,
            as: 'categorias_permitidas',
            attributes: ['id', 'nombre', 'color', 'icono'],
            through: { attributes: [] }
          }
        ]
      });

      res.status(200).json(usuarioActualizado);
    } catch (error) {
      next(error);
    }
  },

  // Delete user
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioActual = req.usuario;

      // Solo super admin puede eliminar usuarios
      if (!usuarioActual.es_super_admin) {
        return res.status(403).json({ 
          error: 'No tienes permiso para eliminar usuarios' 
        });
      }

      // Verificar que el usuario existe
      const usuario = await Usuario.findByPk(id);
      
      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      // No permitir que se elimine a sí mismo
      if (usuarioActual.id === parseInt(id)) {
        return res.status(400).json({ 
          error: 'No puedes eliminarte a ti mismo' 
        });
      }

      // Realizar soft delete
      await usuario.update({ activo: false });

      res.status(200).json({ 
        message: 'Usuario desactivado exitosamente',
        id: parseInt(id)
      });
    } catch (error) {
      next(error);
    }
  },

  // NUEVOS ENDPOINTS para gestión de categorías del usuario

  // Obtener categorías de un usuario
  async getCategorias(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioActual = req.usuario;

      // Solo super admin o el mismo usuario pueden ver sus categorías
      if (!usuarioActual.es_super_admin && usuarioActual.id !== parseInt(id)) {
        return res.status(403).json({ 
          error: 'No tienes permiso para ver las categorías de este usuario' 
        });
      }

      const usuario = await Usuario.findByPk(id);
      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      const categorias = await usuario.obtenerCategoriasPermitidas();

      res.status(200).json({
        success: true,
        data: categorias
      });
    } catch (error) {
      next(error);
    }
  },

  // Asignar categoría a un usuario (solo super admin)
  async asignarCategoria(req, res, next) {
    try {
      const { id } = req.params; // usuario_id
      const { categoria_id } = req.body;
      const usuarioActual = req.usuario;

      if (!usuarioActual.es_super_admin) {
        return res.status(403).json({ 
          error: 'Solo los super administradores pueden asignar categorías' 
        });
      }

      if (!categoria_id) {
        return res.status(400).json({ 
          error: 'El ID de la categoría es requerido' 
        });
      }

      // Verificar que el usuario existe
      const usuario = await Usuario.findByPk(id);
      if (!usuario) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      // Verificar que la categoría existe
      const categoria = await CategoriaMantenimiento.findByPk(categoria_id);
      if (!categoria) {
        return res.status(404).json({ 
          error: 'Categoría no encontrada' 
        });
      }

      // Verificar si ya existe la asignación
      const asignacionExistente = await UsuarioCategoria.findOne({
        where: {
          usuario_id: id,
          categoria_id
        }
      });

      if (asignacionExistente) {
        return res.status(409).json({ 
          error: 'El usuario ya tiene acceso a esta categoría' 
        });
      }

      // Crear la asignación
      await UsuarioCategoria.create({
        usuario_id: id,
        categoria_id
      });

      res.status(201).json({
        success: true,
        message: 'Categoría asignada al usuario exitosamente'
      });
    } catch (error) {
      next(error);
    }
  },

  // Remover categoría de un usuario (solo super admin)
  async removerCategoria(req, res, next) {
    try {
      const { id, categoriaId } = req.params; // usuario_id, categoria_id
      const usuarioActual = req.usuario;

      if (!usuarioActual.es_super_admin) {
        return res.status(403).json({ 
          error: 'Solo los super administradores pueden remover categorías' 
        });
      }

      const asignacion = await UsuarioCategoria.findOne({
        where: {
          usuario_id: id,
          categoria_id: categoriaId
        }
      });

      if (!asignacion) {
        return res.status(404).json({ 
          error: 'El usuario no tiene acceso a esta categoría' 
        });
      }

      await asignacion.destroy();

      res.status(200).json({
        success: true,
        message: 'Categoría removida del usuario exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = usuariosController;