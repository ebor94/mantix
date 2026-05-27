// ============================================
// src/controllers/notificacionesController.js
// ============================================
const { Notificacion, Usuario } = require('../models');
const { Op } = require('sequelize');

const notificacionesController = {
  // Obtener todas las notificaciones del usuario autenticado
  async getMisNotificaciones(req, res, next) {
    try {
      const usuarioId = req.usuario.id;
      const { leida, tipo, page = 1, limit = 20 } = req.query;

      const where = {
        usuario_id: usuarioId,
        activo: true
      };

      if (leida !== undefined) {
        where.leida = leida === 'true';
      }

      if (tipo) {
        where.tipo = tipo;
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await Notificacion.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
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
      next(error);
    }
  },

  // Obtener contador de notificaciones no leídas
  async getContadorNoLeidas(req, res, next) {
    try {
      const usuarioId = req.usuario.id;

      const count = await Notificacion.contarNoLeidas(usuarioId);

      res.status(200).json({
        success: true,
        data: {
          no_leidas: count
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener notificaciones no leídas
  async getNoLeidas(req, res, next) {
    try {
      const usuarioId = req.usuario.id;
      const { limit = 10 } = req.query;

      const notificaciones = await Notificacion.obtenerNoLeidas(usuarioId, parseInt(limit));

      res.status(200).json({
        success: true,
        data: notificaciones,
        total: notificaciones.length
      });
    } catch (error) {
      next(error);
    }
  },

  // Obtener notificación por ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const notificacion = await Notificacion.findOne({
        where: {
          id,
          usuario_id: usuarioId
        }
      });

      if (!notificacion) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada'
        });
      }

      res.status(200).json({
        success: true,
        data: notificacion
      });
    } catch (error) {
      next(error);
    }
  },

  // Marcar notificación como leída
  async marcarComoLeida(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const notificacion = await Notificacion.findOne({
        where: {
          id,
          usuario_id: usuarioId
        }
      });

      if (!notificacion) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada'
        });
      }

      await notificacion.marcarComoLeida();

      res.status(200).json({
        success: true,
        message: 'Notificación marcada como leída',
        data: notificacion
      });
    } catch (error) {
      next(error);
    }
  },

  // Marcar todas las notificaciones como leídas
  async marcarTodasComoLeidas(req, res, next) {
    try {
      const usuarioId = req.usuario.id;

      await Notificacion.marcarTodasLeidasUsuario(usuarioId);

      res.status(200).json({
        success: true,
        message: 'Todas las notificaciones marcadas como leídas'
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar notificación (soft delete)
  async eliminar(req, res, next) {
    try {
      const { id } = req.params;
      const usuarioId = req.usuario.id;

      const notificacion = await Notificacion.findOne({
        where: {
          id,
          usuario_id: usuarioId
        }
      });

      if (!notificacion) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada'
        });
      }

      await notificacion.update({ activo: false });

      res.status(200).json({
        success: true,
        message: 'Notificación eliminada'
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar todas las notificaciones leídas
  async eliminarLeidas(req, res, next) {
    try {
      const usuarioId = req.usuario.id;

      await Notificacion.update(
        { activo: false },
        {
          where: {
            usuario_id: usuarioId,
            leida: true
          }
        }
      );

      res.status(200).json({
        success: true,
        message: 'Notificaciones leídas eliminadas'
      });
    } catch (error) {
      next(error);
    }
  },

  // ADMIN: Crear notificación manual
  async crear(req, res, next) {
    try {
      const {
        usuarios_ids,
        tipo,
        titulo,
        mensaje,
        prioridad,
        referencia_tipo,
        referencia_id,
        url_accion
      } = req.body;

      if (!usuarios_ids || !Array.isArray(usuarios_ids) || usuarios_ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar al menos un usuario'
        });
      }

      if (!tipo || !titulo || !mensaje) {
        return res.status(400).json({
          success: false,
          message: 'Tipo, título y mensaje son requeridos'
        });
      }

      const notificaciones = await Notificacion.crearParaMultiplesUsuarios(
        usuarios_ids,
        {
          tipo,
          titulo,
          mensaje,
          prioridad: prioridad || 'media',
          referencia_tipo,
          referencia_id,
          url_accion
        }
      );

      res.status(201).json({
        success: true,
        message: `Se crearon ${notificaciones.length} notificaciones`,
        data: notificaciones
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = notificacionesController;