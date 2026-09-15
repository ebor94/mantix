/**
 * sv/jobs/otpCleanup.job.js — SP-3
 * Cada hora borra OTPs cuya expiración pasó hace más de 24h.
 */
const cron = require('node-cron');
const eventoOtp = require('../services/eventoOtp.service');

let task;

function start() {
  if (task) return;
  task = cron.schedule('0 * * * *', async () => {
    try {
      await eventoOtp.cleanupVencidos();
    } catch (e) {
      console.error('[otpCleanup] error:', e.message);
    }
  }, { timezone: 'America/Bogota' });
  console.log('[otpCleanup] cron iniciado (0 * * * *, America/Bogota)');
}

module.exports = { start };
