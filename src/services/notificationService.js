// ============================================
// src/services/notificationService.js
// ============================================
const { Notificacion, Usuario } = require('../models');
const emailService = require('./emailService');
const { TIPOS_NOTIFICACION } = require('../config/constants');

const notificationService = {
  // Crear notificación
  async crearNotificacion(usuario_id, tipo, titulo, mensaje, referencia_tipo = null, referencia_id = null) {
    try {
      const notificacion = await Notificacion.create({
        usuario_id,
        tipo,
        titulo,
        mensaje,
        referencia_tipo,
        referencia_id
      });

      // Enviar email si el usuario tiene email configurado
      const usuario = await Usuario.findByPk(usuario_id);
      if (usuario && usuario.email) {
        await emailService.enviarNotificacion(usuario.email, titulo, mensaje);
        await notificacion.update({ 
          enviada_email: true, 
          fecha_envio_email: new Date() 
        });
      }

      return notificacion;
    } catch (error) {
      console.error('Error al crear notificación:', error);
    }
  },

  // Notificar nueva solicitud
  async notificarNuevaSolicitud(solicitud) {
    // Obtener todos los supervisores y administradores
    const usuarios = await Usuario.findAll({
      where: {
        rol_id: [1, 2], // Admin y Supervisor
        activo: true
      }
    });

    const promesas = usuarios.map(usuario => 
      this.crearNotificacion(
        usuario.id,
        TIPOS_NOTIFICACION.SOLICITUD_NUEVA,
        'Nueva Solicitud R-275',
        `Nueva solicitud: ${solicitud.titulo}`,
        'solicitud',
        solicitud.id
      )
    );

    await Promise.all(promesas);
  },

  // Notificar solicitud asignada
  async notificarSolicitudAsignada(solicitud, usuario_id) {
    await this.crearNotificacion(
      usuario_id,
      TIPOS_NOTIFICACION.SOLICITUD_ASIGNADA,
      'Solicitud Asignada',
      `Se te ha asignado la solicitud: ${solicitud.titulo}`,
      'solicitud',
      solicitud.id
    );
  },

  // Notificar solicitud resuelta
  async notificarSolicitudResuelta(solicitud) {
    await this.crearNotificacion(
      solicitud.solicitante_id,
      TIPOS_NOTIFICACION.SOLICITUD_RESUELTA,
      'Solicitud Resuelta',
      `Tu solicitud "${solicitud.titulo}" ha sido resuelta`,
      'solicitud',
      solicitud.id
    );
  },

  // Notificar mantenimiento próximo
  async notificarMantenimientoProximo(mantenimiento, usuario_id) {
    await this.crearNotificacion(
      usuario_id,
      TIPOS_NOTIFICACION.MANTENIMIENTO_PROXIMO,
      'Mantenimiento Próximo',
      `Tienes un mantenimiento programado próximamente`,
      'mantenimiento',
      mantenimiento.id
    );
  },

  // Marcar notificación como leída
  async marcarComoLeida(notificacion_id) {
    const notificacion = await Notificacion.findByPk(notificacion_id);
    if (notificacion) {
      await notificacion.update({
        leida: true,
        fecha_lectura: new Date()
      });
    }
  },

  // Obtener notificaciones de un usuario
  async obtenerNotificaciones(usuario_id, limite = 50) {
    return await Notificacion.findAll({
      where: { usuario_id },
      limit: limite,
      order: [['created_at', 'DESC']]
    });
  },

  // Obtener notificaciones no leídas
  async obtenerNoLeidas(usuario_id) {
    return await Notificacion.findAll({
      where: { 
        usuario_id,
        leida: false 
      },
      order: [['created_at', 'DESC']]
    });
  }
};

module.exports = notificationService;