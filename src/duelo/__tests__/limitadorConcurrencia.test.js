const { crearLimitador } = require('../services/limitadorConcurrencia');

const diferida = () => {
  let resolver; let rechazar;
  const promesa = new Promise((ok, mal) => { resolver = ok; rechazar = mal; });
  return { promesa, resolver, rechazar };
};
const vaciarCola = () => new Promise((ok) => { setImmediate(ok); });
const lleno = () => Object.assign(new Error('lleno'), { code: 'LLENO' });

test('ejecuta a lo sumo N tareas a la vez y encola las demás en orden', async () => {
  const limitador = crearLimitador({ maximo: 2, maxEnEspera: 5, errorLleno: lleno });
  const tareas = [diferida(), diferida(), diferida(), diferida()];
  const iniciadas = [];
  const resultados = tareas.map((t, i) => limitador.ejecutar(() => { iniciadas.push(i); return t.promesa; }));
  await vaciarCola();
  expect(iniciadas).toEqual([0, 1]);
  expect(limitador.estado()).toEqual({ activas: 2, enEspera: 2 });

  tareas[1].resolver('b');
  await vaciarCola();
  expect(iniciadas).toEqual([0, 1, 2]);
  tareas[0].resolver('a'); tareas[2].resolver('c');
  await vaciarCola();
  tareas[3].resolver('d');
  expect(await Promise.all(resultados)).toEqual(['a', 'b', 'c', 'd']);
  expect(limitador.estado()).toEqual({ activas: 0, enEspera: 0 });
});

test('con la cola llena rechaza de inmediato sin ejecutar la tarea', async () => {
  const limitador = crearLimitador({ maximo: 1, maxEnEspera: 1, errorLleno: lleno });
  const bloqueo = diferida();
  const primera = limitador.ejecutar(() => bloqueo.promesa);
  const segunda = limitador.ejecutar(async () => 'segunda');
  const tercera = jest.fn();
  await expect(limitador.ejecutar(tercera)).rejects.toMatchObject({ code: 'LLENO' });
  expect(tercera).not.toHaveBeenCalled();
  bloqueo.resolver('primera');
  expect(await primera).toBe('primera');
  expect(await segunda).toBe('segunda');
});

test('libera el turno cuando la tarea falla (también si lanza de forma síncrona)', async () => {
  const limitador = crearLimitador({ maximo: 1, maxEnEspera: 0, errorLleno: lleno });
  await expect(limitador.ejecutar(async () => { throw new Error('async'); })).rejects.toThrow('async');
  await expect(limitador.ejecutar(() => { throw new Error('sync'); })).rejects.toThrow('sync');
  expect(limitador.estado()).toEqual({ activas: 0, enEspera: 0 });
  expect(await limitador.ejecutar(async () => 'sigue')).toBe('sigue');
});

test('una tarea que falla deja pasar a la siguiente en espera', async () => {
  const limitador = crearLimitador({ maximo: 1, maxEnEspera: 1, errorLleno: lleno });
  const bloqueo = diferida();
  const primera = limitador.ejecutar(() => bloqueo.promesa);
  const segunda = limitador.ejecutar(async () => 'segunda');
  bloqueo.rechazar(new Error('falla'));
  await expect(primera).rejects.toThrow('falla');
  expect(await segunda).toBe('segunda');
});

test('el turno que se libera pasa al que espera: una tarea nueva no se cuela entre medio', async () => {
  const limitador = crearLimitador({ maximo: 1, maxEnEspera: 5, errorLleno: lleno });
  let enCurso = 0; let pico = 0;
  const medir = async () => { enCurso += 1; pico = Math.max(pico, enCurso); await vaciarCola(); enCurso -= 1; };
  const a = diferida();
  const primera = limitador.ejecutar(() => a.promesa);
  const segunda = limitador.ejecutar(medir);
  a.resolver();
  // Esta microtarea corre después de que `primera` libera su turno y antes de que `segunda` despierte.
  const tercera = Promise.resolve().then(() => limitador.ejecutar(medir));
  await Promise.all([primera, segunda, tercera]);
  expect(pico).toBe(1);
});
