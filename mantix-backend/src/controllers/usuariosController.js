// Usuarios controller
const { Usuario, Rol } = require('../models');
const { Op } = require('sequelize');
const usuariosController = {
  // Get all users

  async getAll(req, res, next) {
    try {
      // Usamos el método findAll() de Sequelize para obtener todos los usuarios
      const usuarios = await Usuario.findAll({
        // Incluimos el modelo Rol para traer la información del rol de cada usuario
        include: {
          model: Rol,
          as: 'rol', // Este alias debe coincidir con el definido en la asociación del modelo Usuario
          attributes: ['nombre'] // Opcional: solo traemos el nombre del rol
        }
      });
      // Enviamos la lista de usuarios como respuesta
      res.status(200).json(usuarios);
    } catch (error) {
      next(error);
    }
  },
  async getById(req, res, next) {
    try {
      // 1. Obtenemos el ID de los parámetros de la ruta (ej: /api/usuarios/1)
      const { id } = req.params;

      // 2. Usamos findByPk para buscar un usuario por su ID
      const usuario = await Usuario.findByPk(id, {
        // También incluimos el rol, igual que en el listado general
        include: {
          model: Rol,
          as: 'rol',
          attributes: ['nombre']
        }
      });

      // 3. Si el método no encuentra el usuario, devuelve null.
      //    En ese caso, respondemos con un error 404 (No Encontrado).
      if (!usuario) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      // 4. Si se encuentra, lo enviamos como respuesta.
      res.status(200).json(usuario);

    } catch (error) {
      // Si ocurre cualquier otro error, lo pasamos al manejador de errores.
      next(error);
    }
  },


  // Create user
  // En tu controlador de usuarios

  async create(req, res, next) {
    try {
      // 1. Obtenemos los datos del cuerpo de la petición (request body)
      const { rol_id, nombre, apellido, email, password, telefono, avatar } = req.body;

      // 2. Usamos el método `create` de Sequelize.
      // Tu modelo ya se encarga de hashear la contraseña automáticamente gracias al hook `beforeCreate`.
      const nuevoUsuario = await Usuario.create({
        rol_id,
        nombre,
        apellido,
        email,
        password,
        telefono,
        avatar
      });

      // 3. Respondemos con un estado 201 (Created) y el objeto del usuario recién creado.
      // El método `toJSON` de tu modelo eliminará la contraseña de la respuesta automáticamente.
      res.status(201).json(nuevoUsuario);

    } catch (error) {
      // 4. Manejo de errores específicos de Sequelize
      if (error.name === 'SequelizeUniqueConstraintError') {
        // Este error ocurre si se viola una restricción única (como el email)
        return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
      }
      if (error.name === 'SequelizeValidationError') {
        // Este error ocurre si faltan campos requeridos o los datos no son válidos
        const errores = error.errors.map(err => ({ campo: err.path, mensaje: err.message }));
        return res.status(400).json({ message: 'Error de validación', errores });
      }

      // Para cualquier otro error, lo pasamos al manejador de errores global
      next(error);
    }
  },
// Update user controller
async update(req, res, next) {
  try {
    const { id } = req.params;
    const { rol_id, nombre, apellido, email, password, telefono, avatar, activo } = req.body;

    // Verificar si el usuario existe
    const usuario = await Usuario.findByPk(id);
    
    if (!usuario) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado' 
      });
    }

    // Si se está actualizando el email, verificar que no esté en uso por otro usuario
    if (email && email !== usuario.email) {
      const emailExistente = await Usuario.findOne({ 
        where: { 
          email,
          id: { [Op.ne]: id } // Excluir el usuario actual
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
    if (password !== undefined) datosActualizacion.password = password; // Se hasheará automáticamente por el hook
    if (telefono !== undefined) datosActualizacion.telefono = telefono;
    if (avatar !== undefined) datosActualizacion.avatar = avatar;
    if (activo !== undefined) datosActualizacion.activo = activo;

    // Actualizar usuario
    await usuario.update(datosActualizacion);

    // Obtener usuario actualizado con su rol
    const usuarioActualizado = await Usuario.findByPk(id, {
      include: [{
        model: Rol,
        as: 'rol',
        attributes: ['nombre']
      }]
    });

    res.status(200).json(usuarioActualizado);
  } catch (error) {
    next(error);
  }
},
  // Delete user
  delete: (req, res) => {
    // Logic to delete user will be implemented here
    res.status(200).json({ message: 'Delete user endpoint' });
  }
};

module.exports = usuariosController;