// ============================================
// src/controllers/authController.js
// ============================================
const jwt    = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Usuario, Rol } = require('../models');
const { MENSAJES } = require('../config/constants');
const logger = require('../utils/logger');

// Intenta autenticar contra LDAP/AD si está configurado.
// Retorna true si la autenticación fue exitosa, false si falló.
async function intentarLDAP(sam, password) {
  if (!process.env.LDAP_URL) return false;
  try {
    const { autenticarLDAP } = require('../h360/services/ldap.service');
    await autenticarLDAP(sam, password);
    return true;
  } catch (err) {
    logger.debug(`[Auth] LDAP falló para ${sam}: ${err.message}`);
    return false;
  }
}

// Extrae el sAMAccountName desde email o usuario limpio.
// Acepta: "jperez", "jperez@olivos.local", "OLIVOS\jperez"
function extraerSam(login) {
  if (login.includes('@')) return login.split('@')[0];
  if (login.includes('\\')) return login.split('\\')[1];
  return login;
}

const authController = {
  // Login — soporta autenticación LDAP (AD) con fallback a contraseña local
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
      }

      const sam = extraerSam(email);

      // ---------------------------------------------------------
      // 1. Buscar usuario en la BD local (por email exacto o por
      //    patrón sam@olivos.local para usuarios del AD)
      // ---------------------------------------------------------
      const usuario = await Usuario.findOne({
        where: {
          activo: true,
          [Op.or]: [
            { email: email },
            { email: `${sam}@olivos.local` },
            { email: `${sam}@serfunorte.com` }
          ]
        },
        include: [{ model: Rol, as: 'rol' }]
      });

      if (!usuario) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }

      // ---------------------------------------------------------
      // 2. Verificar contraseña: LDAP primero, luego local (bcrypt)
      // ---------------------------------------------------------
      const ldapOk  = await intentarLDAP(sam, password);
      const localOk = ldapOk ? false : await usuario.validarPassword(password);

      if (!ldapOk && !localOk) {
        return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      }

      logger.info(`[Auth] ${ldapOk ? 'LDAP' : 'local'} — usuario ${usuario.email} autenticado`);

      // ---------------------------------------------------------
      // 3. Emitir JWT y devolver datos del usuario
      // ---------------------------------------------------------
      const token = jwt.sign(
        { id: usuario.id, email: usuario.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      await usuario.update({ ultimo_acceso: new Date() });

      res.json({
        success: true,
        data: {
          token,
          usuario: {
            id:          usuario.id,
            nombre:      usuario.nombre,
            apellido:    usuario.apellido,
            email:       usuario.email,
            es_super_admin: usuario.es_super_admin,
            rol:         usuario.rol
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
