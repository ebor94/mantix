const { crearJobs, CRONES } = require('../jobs');

const cronFalso = () => {
  const tareas = [];
  return { tareas, schedule: jest.fn((expr, fn, opts) => { const t = { expr, fn, opts, stop: jest.fn() }; tareas.push(t); return t; }) };
};
const logFalso = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

test('programa outbox (cada 2 min), recordatorio 2d (07:00 todos los días) y es hoy (06:30 L-V) en hora Colombia', () => {
  const cron = cronFalso();
  crearJobs({ cron, log: logFalso(), habilitado: true, tareas: { outbox: jest.fn(), recordatorios2d: jest.fn(), esHoy: jest.fn() } }).start();
  expect(cron.tareas.map((t) => [t.expr, t.opts.timezone])).toEqual([
    ['*/2 * * * *', 'America/Bogota'], ['0 7 * * *', 'America/Bogota'], ['30 6 * * 1-5', 'America/Bogota'],
  ]);
  expect(CRONES.recordatorios2d).toBe('0 7 * * *'); // también fines de semana: el de una cita del lunes sale el sábado
});

test('deshabilitado (MSJ_JOBS_ENABLED distinto de "true") no programa nada', () => {
  const cron = cronFalso();
  crearJobs({ cron, log: logFalso(), habilitado: false, tareas: {} }).start();
  expect(cron.schedule).not.toHaveBeenCalled();
});

test('start dos veces no duplica; stop detiene todo', () => {
  const cron = cronFalso();
  const j = crearJobs({ cron, log: logFalso(), habilitado: true, tareas: { outbox: jest.fn(), recordatorios2d: jest.fn(), esHoy: jest.fn() } });
  j.start();
  j.start();
  expect(cron.schedule).toHaveBeenCalledTimes(3);
  j.stop();
  expect(cron.tareas.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
});

test('una corrida que lanza se registra y la siguiente corre normal; no se solapan dos corridas de la misma tarea', async () => {
  const cron = cronFalso();
  const log = logFalso();
  let soltar;
  const outbox = jest.fn()
    .mockImplementationOnce(() => new Promise((r) => { soltar = r; }))
    .mockImplementationOnce(async () => { throw new Error('BD caída'); })
    .mockImplementation(async () => ({ procesadas: 0 }));
  crearJobs({ cron, log, habilitado: true, tareas: { outbox, recordatorios2d: jest.fn(), esHoy: jest.fn() } }).start();
  const tick = cron.tareas[0].fn;
  const primera = tick();
  await tick(); // la primera sigue corriendo: esta se salta
  expect(outbox).toHaveBeenCalledTimes(1);
  soltar();
  await primera;
  await tick(); // lanza
  expect(log.error).toHaveBeenCalledTimes(1);
  await tick(); // normal
  expect(outbox).toHaveBeenCalledTimes(3);
});
