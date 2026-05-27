/**
 * sv/jobs/renovaciones.job.js
 * Cron jobs del módulo de renovaciones B2B (Fase 8):
 *   - 00:30 BOG: crear prospectos de renovación para convenios que vencen en ≤30 días
 *   - 01:00 BOG: marcar como VENCIDO los convenios que ya pasaron sin renovarse
 */
const cron = require('node-cron');
const logger = require('../../utils/logger');
const renov = require('../services/renovaciones.service');

let taskRenov;
let taskVenc;

function start() {
  if (!taskRenov) {
    taskRenov = cron.schedule('30 0 * * *', async () => {
      try {
        const r = await renov.procesarRenovacionesPendientes();
        logger.info(`[SerVentas Renovaciones] Creadas ${r.creados}/${r.total_revisados} renovaciones pendientes.`);
      } catch (e) {
        logger.error('[SerVentas Renovaciones] procesarRenovacionesPendientes falló:', e);
      }
    }, { scheduled: true, timezone: 'America/Bogota' });
    logger.info('[SerVentas] Cron renovaciones armado (00:30 America/Bogota).');
  }

  if (!taskVenc) {
    taskVenc = cron.schedule('0 1 * * *', async () => {
      try {
        const r = await renov.procesarVencimientosSinRenovar();
        logger.info(`[SerVentas Renovaciones] Marcados ${r.marcados} convenios vencidos sin renovar.`);
      } catch (e) {
        logger.error('[SerVentas Renovaciones] procesarVencimientosSinRenovar falló:', e);
      }
    }, { scheduled: true, timezone: 'America/Bogota' });
    logger.info('[SerVentas] Cron vencidos armado (01:00 America/Bogota).');
  }

  return { taskRenov, taskVenc };
}

module.exports = { start };
