// ============================================
// src/controllers/authController.js
// ============================================
const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { MENSAJES } = require('../config/constants');
const logger = require('../utils/logger');

const authController = {
  // Login
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validar campos requeridos
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email y contraseña son requeridos'
        });
      }

      // Buscar usuario
      const usuario = await Usuario.findOne({
        where: { email, activo: true },
        include: [{ model: Rol, as: 'rol' }]
      });

      if (!usuario) {
        return res.status(401).json({
          success: false,
          message: 'usuario inválido'
        });
      }

      // Validar contraseña      // LOGS DE DEBUG
    console.log('===== DEBUG LOGIN =====');
    console.log('Email buscado:', email);
    console.log('Usuario encontrado:', usuario.email);
    console.log('Password recibido:', password);
    console.log('Password en BD (hasheado):', usuario.password);
    console.log('Tipo de password en BD:', typeof usuario.password);
    console.log('¿Password es función?', typeof usuario.validarPassword);

    // Validar contraseña
    const passwordValida = await usuario.validarPassword(password);
    console.log('Resultado validación:', passwordValida);
    console.log('=======================');

 
      if (!passwordValida) {
        return res.status(401).json({
          success: false,
          message: 'Credenciales inválidas'
        });
      }

      // Generar token
      const token = jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // Actualizar último acceso
      await usuario.update({ ultimo_acceso: new Date() });

      logger.info(`Usuario ${usuario.email} inició sesión`);

      res.json({
        success: true,
        data: {
          token,
          usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            email: usuario.email,
            rol: usuario.rol
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener perfil del usuario autenticado
  async getProfile(req, res, next) {
    try {
      const usuario = await Usuario.findByPk(req.usuario.id, {
        include: [{ model: Rol, as: 'rol' }]
      });

      res.json({
        success: true,
        data: usuario
      });
    } catch (error) {
      next(error);
    }
  },

  // Cambiar contraseña
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const usuario = await Usuario.findByPk(req.usuario.id);

      const passwordValida = await usuario.validarPassword(currentPassword);
      if (!passwordValida) {
        return res.status(400).json({
          success: false,
          message: 'Contraseña actual incorrecta'
        });
      }

      await usuario.update({ password: newPassword });

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = authController;
