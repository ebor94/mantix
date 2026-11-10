// Jobs del módulo (Tarea 14, spec §11). Solo corren con MSJ_JOBS_ENABLED=true, en UNA instancia de pm2
// (la idempotencia del outbox protege igual si se equivocan). Todos en hora Colombia.
const logger = require('../../utils/logger');
const { errorParaLog } = require('../utils/errorSeguro');

const TZ = 'America/Bogota';
const CRONES = Object.freeze({
  outbox: '*/2 * * * *',
  recordatorios2d: '0 7 * * *', // todos los días: el recordatorio de una cita del lunes sale el sábado
  esHoy: '30 6 * * 1-5',
});

/** Fábrica inyectable (pruebas). `tareas` = { outbox, recordatorios2d, esHoy }: funciones async sin argumentos. */
function crearJobs({ cron = require('node-cron'), log = logger.child({ modulo: 'masajes' }), habilitado, tareas }) {
  let programadas = null;

  const envolver = (nombre, fn) => {
    let enCurso = false;
    return async () => {
      if (enCurso) return; // una corrida lenta no se solapa con la siguiente
      enCurso = true;
      try {
        const r = await fn();
        if (r && (r.procesadas || r.encoladas)) log.info(`masajes job ${nombre}`, r);
      } catch (err) {
        log.error(`masajes job ${nombre} falló`, errorParaLog(err));
      } finally {
        enCurso = false;
      }
    };
  };

  function start() {
    if (!habilitado || programadas) return;
    programadas = Object.entries(CRONES).map(([nombre, expr]) => cron.schedule(expr, envolver(nombre, tareas[nombre]), { timezone: TZ }));
    log.info('masajes: jobs programados', { ...CRONES, timezone: TZ });
  }

  function stop() {
    if (!programadas) return;
    for (const t of programadas) t.stop();
    programadas = null;
  }

  return { start, stop };
}

/** Producción (server.js). Nada se conecta hasta la primera corrida. */
function start() {
  const habilitado = process.env.MSJ_JOBS_ENABLED === 'true';
  if (!habilitado) return null;
  const { leerEntorno, leerIntegraciones } = require('../config/entorno');
  const entorno = leerEntorno();
  if (!entorno.ok) {
    logger.error(`masajes jobs no iniciados: ${entorno.motivo}`);
    return null;
  }
  const { bd } = require('../routes'); // mismo pool perezoso que la API
  const { crearServicios } = require('../services');
  const { crearWorkerOutbox } = require('../services/worker.service');
  const { crearServicioRecordatorios } = require('../services/recordatorios.service');
  const { crearAdaptadoresReales } = require('../adapters');

  const obtenerConfig = () => leerEntorno().config;
  const servicios = crearServicios({ bd, obtenerConfig });
  let adaptadores = null;
  const worker = crearWorkerOutbox({
    bd,
    obtenerConfig,
    obtenerIntegraciones: () => {
      const i = leerIntegraciones();
      if (i.ok && !adaptadores) adaptadores = crearAdaptadoresReales(i.config);
      return i;
    },
    adaptadores: new Proxy({}, { get: (_, k) => adaptadores && adaptadores[k] }),
    log: logger.child({ modulo: 'masajes' }),
  });
  const recordatorios = crearServicioRecordatorios({ bd, outbox: servicios.outbox });
  const jobs = crearJobs({
    habilitado,
    tareas: {
      outbox: () => worker.procesarPendientes(),
      recordatorios2d: () => recordatorios.encolarRecordatorios2d(new Date()),
      esHoy: () => recordatorios.encolarEsHoy(new Date()),
    },
  });
  jobs.start();
  return jobs;
}

module.exports = { crearJobs, start, CRONES };
