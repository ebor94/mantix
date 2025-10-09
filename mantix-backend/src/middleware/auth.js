// ============================================
// src/middleware/auth.js - Autenticación JWT
// ============================================
const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { MENSAJES } = require('../config/constants');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findByPk(decoded.id, {
      include: [{ model: Rol, as: 'rol' }]
    });

    if (!usuario || !usuario.activo) {
      throw new Error();
    }

    req.usuario = usuario;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: MENSAJES.ERROR_AUTENTICACION
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }

    if (!roles.includes(req.usuario.rol_id)) {
      return res.status(403).json({
        success: false,
        message: MENSAJES.ERROR_AUTORIZACION
      });
    }

    next();
  };
};

module.exports = { auth, authorize };