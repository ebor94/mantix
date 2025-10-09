// ============================================
// src/services/cronService.js
// ============================================
const cron = require('node-cron');
const { MantenimientoProgramado, PlanActividad, Usuario } = require('../models');
const { Op } = require('sequelize');
const { ESTADOS_MANTENIMIENTO } = require('../config/constants');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const logger = require('../utils/logger');

const cronService = {
  start() {
    // Actualizar mantenimientos atrasados - Cada día a las 00:00
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('Ejecutando tarea: Actualizar mantenimientos atrasados');
        
        const hoy = new Date().toISOString().split('T')[0];
        
        await MantenimientoProgramado.update(
          { estado_id: ESTADOS_MANTENIMIENTO.ATRASADO },
          {
            where: {
              fecha_programada: { [Op.lt]: hoy },
              estado_id: ESTADOS_MANTENIMIENTO.PROGRAMADO
            }
          }
        );
        
        logger.info('Tarea completada: Mantenimientos atrasados actualizados');
      } catch (error) {
        logger.error('Error en tarea de mantenimientos atrasados:', error);
      }
    });

    // Enviar notificaciones de mantenimientos próximos - Cada día a las 08:00
    cron.schedule('0 8 * * *', async () => {
      try {
        logger.info('Ejecutando tarea: Notificar mantenimientos próximos');
        
        const hoy = new Date();
        const en7Dias = new Date();
        en7Dias.setDate(en7Dias.getDate() + 7);

        const mantenimientos = await MantenimientoProgramado.findAll({
          where: {
            fecha_programada: {
              [Op.between]: [hoy.toISOString().split('T')[0], en7Dias.toISOString().split('T')[0]]
            },
            estado_id: ESTADOS_MANTENIMIENTO.PROGRAMADO,
            notificacion_enviada: false
          },
          include: [{
            model: PlanActividad,
            as: 'actividad',
            include: [{ model: Usuario, as: 'responsable_usuario' }]
          }]
        });

        for (const mant of mantenimientos) {
          if (mant.actividad.responsable_usuario) {
            await notificationService.notificarMantenimientoProximo(
              mant,
              mant.actividad.responsable_usuario.id
            );
            await emailService.enviarRecordatorioMantenimiento(
              mant.actividad.responsable_usuario.email,
              mant
            );
            await mant.update({ 
              notificacion_enviada: true,
              fecha_notificacion: new Date()
            });
          }
        }
        
        logger.info(`Tarea completada: ${mantenimientos.length} notificaciones enviadas`);
      } catch (error) {
        logger.error('Error en tarea de notificaciones:', error);
      }
    });

    logger.info('✅ Tareas programadas (cron) configuradas');
  }
};

module.exports = cronService;

    