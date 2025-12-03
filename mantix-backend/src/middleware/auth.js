// ============================================
// src/middleware/auth.js - Autenticación JWT
// ============================================
const jwt = require('jsonwebtoken');
const { Usuario, Rol, UsuarioCategoria } = require('../models');
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

    // Agregar información de categorías permitidas al request
    req.usuario = usuario;
    req.user = usuario; // Alias para compatibilidad
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: MENSAJES.ERROR_AUTENTICACION
    });
  }
};

/**
 * Middleware para autorizar por rol
 * @param {...number} roles - IDs de roles permitidos
 */
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

/**
 * Middleware para verificar si el usuario es super admin
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({
      success: false,
      message: MENSAJES.ERROR_AUTENTICACION
    });
  }

  if (!req.usuario.es_super_admin) {
    return res.status(403).json({
      success: false,
      message: 'Solo los super administradores pueden realizar esta acción'
    });
  }

  next();
};

/**
 * Middleware para verificar acceso a una categoría específica
 * El ID de la categoría debe venir en req.params.categoriaId o req.body.categoria_id
 */
const requireCategoriaAccess = async (req, res, next) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }

    // Si es super admin, tiene acceso a todo
    if (req.usuario.es_super_admin) {
      return next();
    }

    // Obtener el ID de la categoría desde params o body
    const categoriaId = req.params.categoriaId || req.body.categoria_id;

    if (!categoriaId) {
      return res.status(400).json({
        success: false,
        message: 'ID de categoría no proporcionado'
      });
    }

    // Verificar si el usuario tiene acceso a esta categoría
    const tieneAcceso = await req.usuario.tieneAccesoCategoria(parseInt(categoriaId));

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para acceder a esta categoría'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar permisos de categoría',
      error: error.message
    });
  }
};

/**
 * Middleware para verificar acceso a un equipo específico
 * El ID del equipo debe venir en req.params.id o req.params.equipoId
 */
const requireEquipoAccess = async (req, res, next) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }

    // Si es super admin, tiene acceso a todo
    if (req.usuario.es_super_admin) {
      return next();
    }

    // Obtener el ID del equipo desde params
    const equipoId = req.params.id || req.params.equipoId;

    if (!equipoId) {
      return res.status(400).json({
        success: false,
        message: 'ID de equipo no proporcionado'
      });
    }

    const { Equipo } = require('../models');

    // Verificar si el usuario tiene acceso a este equipo
    const tieneAcceso = await Equipo.tienePermiso(
      parseInt(equipoId), 
      req.usuario.id, 
      { Usuario, Equipo, UsuarioCategoria }
    );

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para acceder a este equipo'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar permisos de equipo',
      error: error.message
    });
  }
};

/**
 * Middleware para verificar acceso a una actividad de plan de mantenimiento
 * El ID de la actividad debe venir en req.params.id o req.params.actividadId
 */
const requireActividadAccess = async (req, res, next) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }

    // Si es super admin, tiene acceso a todo
    if (req.usuario.es_super_admin) {
      return next();
    }

    // Obtener el ID de la actividad desde params
    const actividadId = req.params.id || req.params.actividadId;

    if (!actividadId) {
      return res.status(400).json({
        success: false,
        message: 'ID de actividad no proporcionado'
      });
    }

    const { PlanActividad } = require('../models');

    // Buscar la actividad y verificar acceso a su categoría
    const actividad = await PlanActividad.findByPk(parseInt(actividadId));

    if (!actividad) {
      return res.status(404).json({
        success: false,
        message: 'Actividad no encontrada'
      });
    }

    // Verificar si el usuario tiene acceso a la categoría de la actividad
    const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permiso para acceder a esta actividad'
      });
    }

    // Guardar la actividad en el request para evitar otra consulta
    req.actividad = actividad;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar permisos de actividad',
      error: error.message
    });
  }
};

/**
 * Middleware para verificar si el usuario tiene al menos una categoría asignada
 */
const requireAnyCategoriaAccess = async (req, res, next) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: MENSAJES.ERROR_AUTENTICACION
      });
    }
    console.log('Verificando acceso a cualquier categoría para usuario:', req.usuario);
    // Si es super admin, tiene acceso a todo
    if (req.usuario.es_super_admin) {
      return next();
    }

    // Verificar si tiene al menos una categoría asignada
    const categoriasCount = await UsuarioCategoria.count({
      where: { usuario_id: req.usuario.id }
    });

    if (categoriasCount === 0) {
      return res.status(403).json({
        success: false,
        message: 'No tienes categorías asignadas. Contacta al administrador.'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar permisos',
      error: error.message
    });
  }
};

/**
 * Middleware combinado: requiere autenticación y al menos una categoría
 * Como son funciones async, no podemos usar array directamente
 */
const authWithCategories = async (req, res, next) => {
  try {
    // Primero ejecutar auth
    await new Promise((resolve, reject) => {
      auth(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Luego ejecutar requireAnyCategoriaAccess
    await requireAnyCategoriaAccess(req, res, next);
  } catch (error) {
    // El error ya fue manejado por los middlewares individuales
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error en la autenticación'
      });
    }
  }
};

module.exports = { 
  auth, 
  authorize,
  requireSuperAdmin,
  requireCategoriaAccess,
  requireEquipoAccess,
  requireActividadAccess,
  requireAnyCategoriaAccess,
  authWithCategories
};