/**
 * sv/jobs/snapshotDiario.job.js
 * Cron 23:55 America/Bogota — genera snapshot del día para todos los usuarios.
 */
const cron = require('node-cron');
const logger = require('../../utils/logger');
const { generarSnapshot } = require('../services/snapshot.service');

let task;

function start() {
  if (task) return task;
  task = cron.schedule('55 23 * * *', async () => {
    try {
      const r = await generarSnapshot();
      logger.info(`[SerVentas] Snapshot diario OK (${r.afectados} filas).`);
    } catch (e) {
      logger.error('[SerVentas] Snapshot diario falló:', e);
    }
  }, { scheduled: true, timezone: 'America/Bogota' });
  logger.info('[SerVentas] Cron snapshot diario armado (23:55 America/Bogota).');
  return task;
}

module.exports = { start, generarSnapshot };
