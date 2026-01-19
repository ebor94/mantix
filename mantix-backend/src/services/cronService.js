// ============================================
// src/services/cronService.js (VERSIÓN FINAL CORREGIDA)
// ============================================
const cron = require('node-cron');
const { MantenimientoProgramado, PlanActividad, Usuario, PlanMantenimiento, Equipo, AuditLog   } = require('../models');
const { Op } = require('sequelize');
const { ESTADOS_MANTENIMIENTO } = require('../config/constants');
const notificationService = require('./notificationService');
const emailService = require('./emailService');
const webhookService = require('./webhookService');
const logger = require('../utils/logger');

const cronService = {
  start() {
    // Actualizar mantenimientos atrasados - Cada día a las 00:00
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('🔄 Ejecutando tarea: Actualizar mantenimientos atrasados');
        
        const hoy = new Date().toISOString().split('T')[0];
        
        const resultado = await MantenimientoProgramado.update(
          { estado_id: ESTADOS_MANTENIMIENTO.ATRASADO },
          {
            where: {
              fecha_programada: { [Op.lt]: hoy },
              estado_id: ESTADOS_MANTENIMIENTO.PROGRAMADO
            }
          }
        );
        
        const cantidadActualizados = resultado[0];
        
        if (cantidadActualizados > 0) {
          await webhookService.enviarNotificacion(
            '⚠️ Actualización de Mantenimientos Atrasados',
            `Se han actualizado *${cantidadActualizados}* mantenimiento(s) a estado ATRASADO.\n\n` +
            `Fecha de verificación: ${new Date().toLocaleString('es-CO')}`
          );
        }
        
        logger.info(`✅ Tarea completada: ${cantidadActualizados} mantenimientos actualizados a ATRASADO`);
      } catch (error) {
        logger.error('❌ Error en tarea de mantenimientos atrasados:', error);
        
        await webhookService.enviarNotificacion(
          '🔴 Error en Tarea Programada',
          `Error al actualizar mantenimientos atrasados:\n\n\`\`\`${error.message}\`\`\``
        );
      }
    });

    // Enviar notificaciones de mantenimientos próximos - Cada día a las 08:00
     // cron.schedule('*/1 * * * *', async () => { 
 // ============================================
// Actualización del cron de notificaciones próximas
// ============================================
cron.schedule('0 8 * * *', async () => {
  try {
    logger.info('🔄 Ejecutando tarea: Notificar mantenimientos próximos');
    
    const hoy = new Date();
    const en7Dias = new Date();
    en7Dias.setDate(en7Dias.getDate() + 7);

    // Fecha de hace 3 días para permitir reenvío
    const hace3Dias = new Date();
    hace3Dias.setDate(hace3Dias.getDate() - 3);

    const mantenimientos = await MantenimientoProgramado.findAll({
      where: {
        fecha_programada: {
          [Op.between]: [hoy.toISOString().split('T')[0], en7Dias.toISOString().split('T')[0]]
        },
        estado_id: ESTADOS_MANTENIMIENTO.PROGRAMADO,
        [Op.or]: [
          { notificacion_enviada: false },
          { 
            notificacion_enviada: true,
            fecha_notificacion: { [Op.lt]: hace3Dias }  // Reenviar si pasaron 3 días
          }
        ]
      },
      include: [{
        model: PlanActividad,
        as: 'actividad',
        include: [
          { 
            model: Usuario, 
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'email']
          }
        ]
      }]
    });

    let notificacionesEnviadas = 0;
    let detallesMantenimientos = [];
    let reenvios = 0;

    for (const mant of mantenimientos) {
      if (mant.actividad && mant.actividad.responsable_usuario) {
        const esReenvio = mant.notificacion_enviada === true;
        
        // Enviar notificación interna
        await notificationService.notificarMantenimientoProximo(
          mant,
          mant.actividad.responsable_usuario.id
        );
        
        // Enviar email
        // await emailService.enviarRecordatorioMantenimiento(
        //   mant.actividad.responsable_usuario.email,
        //   mant
        // );

        // Registrar en audit_log
        await AuditLog.create({
          usuario_id: mant.actividad.responsable_usuario.id,
          accion: esReenvio ? 'REENVIO_NOTIFICACION_MANTENIMIENTO' : 'ENVIO_NOTIFICACION_MANTENIMIENTO',
          tabla: 'mantenimientos_programados',
          registro_id: mant.id,
          datos_anteriores: {
            notificacion_enviada: mant.notificacion_enviada,
            fecha_notificacion: mant.fecha_notificacion
          },
          datos_nuevos: {
            notificacion_enviada: true,
            fecha_notificacion: new Date(),
            tipo_notificacion: esReenvio ? 'reenvio' : 'primera_vez',
            fecha_programada: mant.fecha_programada,
            codigo: mant.codigo,
            responsable: mant.actividad.responsable_usuario.nombre,
            email_enviado: mant.actividad.responsable_usuario.email
          },
          ip_address: '127.0.0.1', // IP del servidor
          user_agent: 'CRON_JOB_NOTIFICACIONES'
        });
        
        // Actualizar registro
        await mant.update({ 
          notificacion_enviada: true,
          fecha_notificacion: new Date()
        });

        // Guardar detalles para el webhook
        detallesMantenimientos.push({
          codigo: mant.codigo,
          fecha: mant.fecha_programada,
          hora: mant.hora_programada || 'No especificada',
          prioridad: mant.prioridad,
          responsable: mant.actividad.responsable_usuario.nombre,
          actividad: mant.actividad.nombre || 'Sin nombre',
          descripcionActividad: mant.actividad.descripcion || '',
          observaciones: mant.observaciones || '',
          esReenvio: esReenvio
        });

        notificacionesEnviadas++;
        if (esReenvio) reenvios++;
      }
    }

    if (notificacionesEnviadas > 0) {
      // Crear mensaje detallado
      let mensajeDetalle = detallesMantenimientos.map((mant, index) => {
        const iconoPrioridad = {
          'critica': '🔴',
          'alta': '🟠',
          'media': '🟡',
          'baja': '🟢'
        };
        
        let detalle = `${index + 1}. ${iconoPrioridad[mant.prioridad] || '⚪'} *${mant.codigo}*`;
        
        if (mant.esReenvio) {
          detalle += ` 🔄 _(Reenvío)_`;
        }
        
        detalle += `\n   📅 Fecha: ${mant.fecha}`;
        
        if (mant.hora !== 'No especificada') {
          detalle += ` 🕐 ${mant.hora}`;
        }
        
        detalle += `\n   👤 Responsable: ${mant.responsable}`;
        detalle += `\n   🔧 Actividad: ${mant.actividad}`;
        
        if (mant.descripcionActividad) {
          const descripcionCorta = mant.descripcionActividad.length > 100 
            ? mant.descripcionActividad.substring(0, 100) + '...' 
            : mant.descripcionActividad;
          detalle += `\n   📝 Descripción: ${descripcionCorta}`;
        }
        
      
        
        return detalle;
      }).join('\n\n');

      // Mensaje de resumen
      let resumen = `Se han enviado *${notificacionesEnviadas}* recordatorio(s) de mantenimientos próximos.`;
      if (reenvios > 0) {
        resumen += `\n⚠️ _${reenvios} de estos son reenvíos (sin gestionar en 3+ días)_`;
      }

      // Enviar notificación a Google Chat
      await webhookService.enviarNotificacion(
        '🔔 Recordatorios de Mantenimiento Enviados',
        `${resumen}\n\n` +
        `📋 *Mantenimientos programados (próximos 7 días):*\n\n${mensajeDetalle}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📆 Período: ${hoy.toLocaleDateString('es-CO')} - ${en7Dias.toLocaleDateString('es-CO')}\n` +
        `🕐 Notificación enviada: ${new Date().toLocaleString('es-CO')}`
      );
    } else {
      logger.info('ℹ️ No hay mantenimientos próximos para notificar');
    }
    
    logger.info(`✅ Tarea completada: ${notificacionesEnviadas} notificaciones enviadas (${reenvios} reenvíos)`);
  } catch (error) {
    logger.error('❌ Error en tarea de notificaciones:', error);
    
    await webhookService.enviarNotificacion(
      '🔴 Error en Tarea Programada',
      `Error al enviar notificaciones de mantenimientos próximos:\n\n\`\`\`${error.message}\`\`\``
    );
  }
});

    // Enviar alertas de mantenimientos vencidos - Cada día a las 09:00
//cron.schedule('0 9 * * *', async () => {
cron.schedule('*/1 * * * *', async () => {   
  try {
    logger.info('🔄 Ejecutando tarea: Alertar mantenimientos vencidos');
    
    const hoy = new Date().toISOString().split('T')[0];
    
    const mantenimientosVencidos = await MantenimientoProgramado.findAll({
      where: {
        fecha_programada: { [Op.lt]: hoy },
        estado_id: ESTADOS_MANTENIMIENTO.ATRASADO
      },
      include: [{
        model: PlanActividad,
        as: 'actividad',
        include: [
          { 
            model: Usuario, 
            as: 'responsable_usuario',
            attributes: ['id', 'nombre', 'email']
          }
        ]
      }],
      limit: 10,
      order: [['fecha_programada', 'ASC']]
    });

    if (mantenimientosVencidos.length > 0) {
      let detallesMantenimientos = [];
      
      // Procesar cada mantenimiento vencido
      for (const mant of mantenimientosVencidos) {
        // Calcular días de atraso
        const fechaProgramada = new Date(mant.fecha_programada);
        const fechaHoy = new Date(hoy);
        const diasAtraso = Math.floor((fechaHoy - fechaProgramada) / (1000 * 60 * 60 * 24));
        
        // Obtener información del equipo
        let equipoInfo = null;
        if (mant.actividad && mant.actividad.plan && mant.actividad.plan.equipo_id) {
          equipoInfo = await Equipo.findByPk(mant.actividad.plan.equipo_id, {
            attributes: ['id', 'nombre', 'codigo', 'marca', 'modelo']
          });
        }

        // Guardar detalles
        detallesMantenimientos.push({
          id: mant.id,
          codigo: mant.codigo,
          fecha_programada: mant.fecha_programada,
          hora_programada: mant.hora_programada || 'No especificada',
          dias_atraso: diasAtraso,
          prioridad: mant.prioridad,
          responsable: mant.actividad?.responsable_usuario?.nombre || 'Sin asignar',
          actividad: mant.actividad?.nombre || 'Sin nombre',
          descripcion_actividad: mant.actividad?.descripcion || '',
          reprogramaciones: mant.reprogramaciones || 0
        });

        // Registrar en audit_log
        await AuditLog.create({
          usuario_id: mant.actividad?.responsable_usuario?.id || null,
          accion: 'ALERTA_MANTENIMIENTO_VENCIDO',
          tabla: 'mantenimientos_programados',
          registro_id: mant.id,
          datos_anteriores: null,
          datos_nuevos: {
            codigo: mant.codigo,
            fecha_programada: mant.fecha_programada,
            dias_atraso: diasAtraso,
            estado: 'ATRASADO',
            prioridad: mant.prioridad,
            responsable: mant.actividad?.responsable_usuario?.nombre || 'Sin asignar',
            actividad: mant.actividad?.nombre || 'Sin nombre',
            fecha_alerta: new Date(),
            tipo_alerta: 'cron_diario'
          },
          ip_address: '127.0.0.1',
          user_agent: 'CRON_JOB_ALERTAS_VENCIDOS'
        });
      }

      // Crear mensaje detallado para Google Chat
      let mensajeDetalle = detallesMantenimientos.map((mant, index) => {
        const iconoPrioridad = {
          'critica': '🔴',
          'alta': '🟠',
          'media': '🟡',
          'baja': '🟢'
        };

        const iconoAtraso = mant.dias_atraso > 30 ? '🔥' : 
                           mant.dias_atraso > 15 ? '⚠️' : 
                           mant.dias_atraso > 7 ? '⏰' : '📅';
        
        let detalle = `${index + 1}. ${iconoPrioridad[mant.prioridad] || '⚪'} ${iconoAtraso} *${mant.codigo}*\n`;
        detalle += `   📅 Programado: ${mant.fecha_programada}`;
        
        if (mant.hora_programada !== 'No especificada') {
          detalle += ` 🕐 ${mant.hora_programada}`;
        }
        
        detalle += `\n   ⏱️ Días de atraso: *${mant.dias_atraso} días*`;
        detalle += `\n   👤 Responsable: ${mant.responsable}`;
        detalle += `\n   🔧 Actividad: ${mant.actividad}`;
        

        
        if (mant.reprogramaciones > 0) {
          detalle += `\n   🔄 Reprogramaciones: ${mant.reprogramaciones}`;
        }
        
        if (mant.descripcion_actividad) {
          const descripcionCorta = mant.descripcion_actividad.length > 100 
            ? mant.descripcion_actividad.substring(0, 100) + '...' 
            : mant.descripcion_actividad;
          detalle += `\n   📝 Descripción: ${descripcionCorta}`;
        }
        

        return detalle;
      }).join('\n\n');

      // Calcular estadísticas
      const totalDiasAtraso = detallesMantenimientos.reduce((sum, m) => sum + m.dias_atraso, 0);
      const promedioAtraso = Math.round(totalDiasAtraso / detallesMantenimientos.length);
      const masAtrasado = detallesMantenimientos[0]; // Ya están ordenados por fecha

      // Enviar notificación a Google Chat
      await webhookService.enviarNotificacion(
        '🚨 Alerta: Mantenimientos Vencidos',
        `Hay *${mantenimientosVencidos.length}* mantenimiento(s) vencido(s) que requieren atención inmediata.\n\n` +
        `📊 *Estadísticas:*\n` +
        `   • Promedio de atraso: ${promedioAtraso} días\n` +
        `   • Más atrasado: ${masAtrasado.codigo} (${masAtrasado.dias_atraso} días)\n` +
        `   • Fecha más antigua: ${masAtrasado.fecha_programada}\n\n` +
        `📋 *Detalle de mantenimientos vencidos:*\n\n${mensajeDetalle}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ _Por favor, revisar y gestionar estos mantenimientos lo antes posible._\n` +
        `🕐 Fecha de alerta: ${new Date().toLocaleString('es-CO')}`
      );

      logger.info(`✅ Alerta enviada: ${mantenimientosVencidos.length} mantenimientos vencidos`);
      logger.info(`📊 Promedio de atraso: ${promedioAtraso} días`);
    } else {
      logger.info('ℹ️ No hay mantenimientos vencidos');
    }
  } catch (error) {
    logger.error('❌ Error en tarea de alertas de vencidos:', error);
    
    await webhookService.enviarNotificacion(
      '🔴 Error en Tarea Programada',
      `Error al enviar alertas de mantenimientos vencidos:\n\n\`\`\`${error.message}\`\`\``
    );
  }
});

    // Enviar reporte diario - Cada día a las 18:00
  /*   cron.schedule('0 18 * * *', async () => {
      try {
        logger.info('🔄 Ejecutando tarea: Reporte diario');
        
        const hoy = new Date().toISOString().split('T')[0];
        
        // Contar mantenimientos por estado
        const programados = await MantenimientoProgramado.count({
          where: { estado_id: ESTADOS_MANTENIMIENTO.PROGRAMADO }
        });
        
        const atrasados = await MantenimientoProgramado.count({
          where: { estado_id: ESTADOS_MANTENIMIENTO.ATRASADO }
        });
        
        const enProceso = await MantenimientoProgramado.count({
          where: { estado_id: ESTADOS_MANTENIMIENTO.EN_PROCESO }
        });
        
        const ejecutados = await MantenimientoProgramado.count({
          where: {
            estado_id: ESTADOS_MANTENIMIENTO.EJECUTADO,
            updated_at: {
              [Op.gte]: new Date(hoy)
            }
          }
        });

        const reprogramados = await MantenimientoProgramado.count({
          where: { estado_id: ESTADOS_MANTENIMIENTO.REPROGRAMADO }
        });

        await webhookService.enviarNotificacionConTarjeta(
          '📊 Reporte Diario de Mantenimientos',
          `Resumen del estado de mantenimientos al ${new Date().toLocaleDateString('es-CO')}`,
          {
            '📅 Programados': programados,
            '⚠️ Atrasados': atrasados,
            '🔧 En Proceso': enProceso,
            '🔄 Reprogramados': reprogramados,
            '✅ Ejecutados Hoy': ejecutados,
            'Total Activos': programados + atrasados + enProceso + reprogramados
          }
        );
        
        logger.info('✅ Reporte diario enviado a Google Chat');
      } catch (error) {
        logger.error('❌ Error en tarea de reporte diario:', error);
        
        await webhookService.enviarNotificacion(
          '🔴 Error en Tarea de Reporte',
          `Error al generar reporte diario:\n\n\`\`\`${error.message}\`\`\``
        );
      }
    }); */

    logger.info('✅ Tareas programadas (cron) configuradas correctamente');
    logger.info('⏰ Horarios de ejecución:');
    logger.info('   - 00:00: Actualizar mantenimientos atrasados');
    logger.info('   - 08:00: Enviar notificaciones de mantenimientos próximos');
    logger.info('   - 09:00: Enviar alertas de mantenimientos vencidos');
    logger.info('   - 18:00: Enviar reporte diario');
  }
};

module.exports = cronService;