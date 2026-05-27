/**
 * sv/jobs/tracking.job.js
 * Cron jobs del módulo de tracking GPS (Fase 7):
 *   - 23:00 BOG: cerrar jornadas que quedaron activas (asesor olvidó "Finalizar")
 *   - 02:00 BOG: purgar puntos y jornadas > 90 días (Habeas Data - retención)
 */
const cron = require('node-cron');
const logger = require('../../utils/logger');
const tracking = require('../services/tracking.service');

let taskCierre;
let taskPurga;

function start() {
  if (!taskCierre) {
    taskCierre = cron.schedule('0 23 * * *', async () => {
      try {
        const total = await tracking.cerrarJornadasAbiertas();
        logger.info(`[SerVentas Tracking] Cerradas automáticamente ${total} jornadas activas.`);
      } catch (e) {
        logger.error('[SerVentas Tracking] Cierre nocturno de jornadas falló:', e);
      }
    }, { scheduled: true, timezone: 'America/Bogota' });
    logger.info('[SerVentas] Cron tracking cierre jornadas armado (23:00 America/Bogota).');
  }

  if (!taskPurga) {
    taskPurga = cron.schedule('0 2 * * *', async () => {
      try {
        const r = await tracking.purgarAntiguos();
        logger.info(`[SerVentas Tracking] Purga 90d: ${r.puntos_eliminados} puntos, ${r.jornadas_eliminadas} jornadas.`);
      } catch (e) {
        logger.error('[SerVentas Tracking] Purga nocturna falló:', e);
      }
    }, { scheduled: true, timezone: 'America/Bogota' });
    logger.info('[SerVentas] Cron tracking purga 90d armado (02:00 America/Bogota).');
  }

  return { taskCierre, taskPurga };
}

module.exports = { start };
