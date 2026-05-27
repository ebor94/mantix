// ============================================
// src/services/webhookService.js
// ============================================
const axios = require('axios');
const logger = require('../utils/logger');

// URL del webhook de Google Chat
const WEBHOOK_URL = process.env.WEBHOOK_URL ;

const webhookService = {
  // Enviar notificación genérica a Google Chat
  async enviarNotificacion(titulo, mensaje) {
    try {
      const payload = {
        text: `*${titulo}*\n\n${mensaje}\n\n_Este es un mensaje automático de Mantix - Sistema de Gestión de Mantenimiento_`
      };

      const response = await axios.post(WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('Notificación enviada a Google Chat:', response.data);
      return true;
    } catch (error) {
      logger.error('Error al enviar notificación a Google Chat:', error.message);
      return false;
    }
  },

  // Enviar notificación con formato de tarjeta (Card)
  async enviarNotificacionConTarjeta(titulo, mensaje, detalles = {}) {
    try {
      const payload = {
        cards: [{
          header: {
            title: titulo,
            imageUrl: 'https://developers.google.com/chat/images/quickstart-app-avatar.png'
          },
          sections: [{
            widgets: [
              {
                textParagraph: {
                  text: mensaje
                }
              }
            ]
          }]
        }]
      };

      // Agregar detalles adicionales si existen
      if (Object.keys(detalles).length > 0) {
        const widgetsDetalles = Object.entries(detalles).map(([key, value]) => ({
          keyValue: {
            topLabel: key,
            content: String(value)
          }
        }));
        
        payload.cards[0].sections.push({
          widgets: widgetsDetalles
        });
      }

      const response = await axios.post(WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('Tarjeta enviada a Google Chat:', response.data);
      return true;
    } catch (error) {
      logger.error('Error al enviar tarjeta a Google Chat:', error.message);
      return false;
    }
  },

  // Enviar recordatorio de mantenimiento
  async enviarRecordatorioMantenimiento(mantenimiento) {
    const titulo = '🔔 Recordatorio: Mantenimiento Programado';
    const mensaje = 'Te recordamos que tienes un mantenimiento programado:';
    
    const detalles = {
      'Código': mantenimiento.codigo,
      'Fecha': mantenimiento.fecha_programada,
      'Hora': mantenimiento.hora_programada || 'No especificada'
    };

    return await this.enviarNotificacionConTarjeta(titulo, mensaje, detalles);
  },

  // Enviar alerta de mantenimiento vencido
  async enviarAlertaMantenimientoVencido(mantenimiento) {
    const titulo = '⚠️ Alerta: Mantenimiento Vencido';
    const mensaje = 'El siguiente mantenimiento está vencido. Por favor, atiende esta tarea lo antes posible.';
    
    const detalles = {
      'Código': mantenimiento.codigo,
      'Fecha programada': mantenimiento.fecha_programada,
      'Estado': '🔴 VENCIDO'
    };

    return await this.enviarNotificacionConTarjeta(titulo, mensaje, detalles);
  },

  // Enviar notificación de mantenimiento completado
  async enviarMantenimientoCompletado(mantenimiento) {
    const titulo = '✅ Mantenimiento Completado';
    const mensaje = 'Se ha completado exitosamente el siguiente mantenimiento:';
    
    const detalles = {
      'Código': mantenimiento.codigo,
      'Fecha de ejecución': mantenimiento.fecha_ejecucion || new Date().toLocaleDateString('es-CO'),
      'Estado': '✅ COMPLETADO'
    };

    return await this.enviarNotificacionConTarjeta(titulo, mensaje, detalles);
  },

  // Enviar notificación de solicitud adicional
  async enviarSolicitudAdicional(solicitud) {
    const titulo = '📝 Nueva Solicitud Adicional';
    const mensaje = 'Se ha recibido una nueva solicitud de mantenimiento adicional:';
    
    const detalles = {
      'Equipo': solicitud.equipo_nombre || 'No especificado',
      'Descripción': solicitud.descripcion?.substring(0, 100) + '...' || '',
      'Fecha de solicitud': solicitud.fecha_solicitud || new Date().toLocaleDateString('es-CO'),
      'Estado': solicitud.estado || 'PENDIENTE'
    };

    return await this.enviarNotificacionConTarjeta(titulo, mensaje, detalles);
  }
};

module.exports = webhookService;